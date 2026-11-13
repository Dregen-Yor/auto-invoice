import * as XLSX from 'xlsx';
import type { PersonInfo, ExportRow, InvoiceType } from '../types';
import { InvoiceTypeLabels } from '../types';

// 差旅明细信息
export interface TravelInfo {
  competitionName: string;  // 竞赛名称
  time: string;             // 时间
  location: string;         // 地点
  teamName: string;         // 队伍名称
  remarks: string;          // 备注
}

// 差旅明细模板固定注意事项（E 列）
const TRAVEL_NOTES = [
  '1. 报销差旅请附上此差旅明细表，一事一单一明细，团队去一个地方一单，不同地点的发票不要混在一起',
  '2. 高铁/火车提供票据或发票；航班提供行程单，或发票+登机牌',
  '3. 发票大于等于1000元需提供支付截图，同一天同一公司开的多张发票视为金额合并的发票',
  '4. 请注意发票抬头应为山东大学，个人发票无法报销',
  '5. 请附上参加竞赛的邀请函',
];

// 导出明细（每张发票一行）
export function exportToExcel(persons: PersonInfo[], filename: string = '发票汇总') {
  const rows: ExportRow[] = [];

  for (const person of persons) {
    for (const invoice of person.invoices) {
      if (invoice.parseStatus === 'success' && invoice.type) {
        rows.push({
          name: person.name,
          employeeId: person.employeeId,
          invoiceType: InvoiceTypeLabels[invoice.type],
          amount: invoice.amount || 0,
          date: invoice.date || '',
          description: invoice.description || '',
        });
      }
    }
  }

  // 创建工作表数据
  const worksheetData = [
    ['姓名', '工号/学号', '发票类型', '金额', '日期', '描述'],
    ...rows.map(row => [
      row.name,
      row.employeeId,
      row.invoiceType,
      row.amount,
      row.date,
      row.description,
    ]),
  ];

  // 创建工作簿
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  // 设置列宽
  worksheet['!cols'] = [
    { wch: 10 },  // 姓名
    { wch: 15 },  // 工号/学号
    { wch: 15 },  // 发票类型
    { wch: 12 },  // 金额
    { wch: 12 },  // 日期
    { wch: 30 },  // 描述
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, '发票汇总');

  // 导出文件
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

// 按差旅明细模板格式导出（每张发票一行）
export function exportSummaryToExcel(
  persons: PersonInfo[],
  travelInfo: TravelInfo,
  filename: string = '差旅明细'
) {
  // 发票类型列表，按顺序
  const invoiceTypes: InvoiceType[] = [
    'intercity_transport',
    'intracity_transport',
    'accommodation',
    'registration_fee',
  ];

  // 按人员分组发票
  const personInvoicesMap = new Map<string, {
    name: string;
    employeeId: string;
    invoicesByType: Record<string, number[]>;
  }>();

  for (const person of persons) {
    const key = `${person.name}-${person.employeeId}`;
    if (!personInvoicesMap.has(key)) {
      personInvoicesMap.set(key, {
        name: person.name,
        employeeId: person.employeeId,
        invoicesByType: {
          intercity_transport: [],
          intracity_transport: [],
          accommodation: [],
          registration_fee: [],
        },
      });
    }

    const personData = personInvoicesMap.get(key)!;
    for (const invoice of person.invoices) {
      if (invoice.parseStatus === 'success' && invoice.type && invoice.amount) {
        personData.invoicesByType[invoice.type].push(invoice.amount);
      }
    }
  }

  const personDataList = Array.from(personInvoicesMap.values());

  // 计算小计
  const subtotals = {
    intercity_transport: 0,
    intracity_transport: 0,
    accommodation: 0,
    registration_fee: 0,
  };

  personDataList.forEach(p => {
    invoiceTypes.forEach(type => {
      subtotals[type] += p.invoicesByType[type].reduce((a, b) => a + b, 0);
    });
  });

  const totalAmount = Object.values(subtotals).reduce((a, b) => a + b, 0);

  // 创建工作表数据
  const worksheetData: (string | number | null)[][] = [
    // 表头
    ['姓名', '学号', '城市间交通费', '住宿费', '市内交通费', '报名费'],
  ];

  // 每个人的发票数据，每张发票单独一行
  personDataList.forEach(personData => {
    let isFirstRow = true;

    // 按类型顺序遍历，每张发票单独一行
    // 顺序：城市间交通费、住宿费、市内交通费、报名费
    const typeOrder: { type: InvoiceType; colIndex: number }[] = [
      { type: 'intercity_transport', colIndex: 2 },
      { type: 'accommodation', colIndex: 3 },
      { type: 'intracity_transport', colIndex: 4 },
      { type: 'registration_fee', colIndex: 5 },
    ];

    for (const { type, colIndex } of typeOrder) {
      for (const amount of personData.invoicesByType[type]) {
        const row: (string | number | null)[] = [
          isFirstRow ? personData.name : null,
          isFirstRow ? personData.employeeId : null,
          null, null, null, null,
        ];
        row[colIndex] = amount;
        worksheetData.push(row);
        isFirstRow = false;
      }
    }

    // 如果该人员没有任何发票，仍然添加一行显示姓名
    if (isFirstRow) {
      worksheetData.push([personData.name, personData.employeeId, null, null, null, null]);
    }
  });

  // 添加空行直到第6行（确保至少有5行数据行）
  while (worksheetData.length < 6) {
    worksheetData.push([]);
  }

  // 小计行（G 列为报销总额数值，H 列为标签）
  worksheetData.push([
    '小计',
    null,
    subtotals.intercity_transport || null,
    subtotals.accommodation || null,
    subtotals.intracity_transport || null,
    subtotals.registration_fee || null,
    totalAmount || null,
    '报销总额',
  ]);

  // 空行
  worksheetData.push([]);

  // 竞赛信息（A 列标签、B 列值），右侧 E 列为固定注意事项
  const noticeRowIndex = worksheetData.length; // 「注意：」所在行（0 基）
  worksheetData.push(['竞赛名称：', travelInfo.competitionName, null, null, '注意：']);
  worksheetData.push(['时间：', travelInfo.time, null, null, TRAVEL_NOTES[0]]);
  worksheetData.push(['地点：', travelInfo.location, null, null, TRAVEL_NOTES[1]]);
  worksheetData.push(['队伍名称：', travelInfo.teamName, null, null, TRAVEL_NOTES[2]]);
  worksheetData.push(['备注（问题反馈等）', travelInfo.remarks, null, null, TRAVEL_NOTES[3]]);
  worksheetData.push([null, null, null, null, TRAVEL_NOTES[4]]);

  // 创建工作簿
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  // 合并「注意：」单元格（E:G）
  worksheet['!merges'] = [
    { s: { r: noticeRowIndex, c: 4 }, e: { r: noticeRowIndex, c: 6 } },
  ];

  // 设置列宽（与差旅明细模板 v3 保持一致）
  worksheet['!cols'] = [
    { wch: 11.22 },  // A 姓名
    { wch: 15.12 },  // B 学号
    { wch: 16 },     // C 城市间交通费
    { wch: 11.22 },  // D 住宿费
    { wch: 16.34 },  // E 市内交通费
    { wch: 8.88 },   // F 报名费
    { wch: 17.22 },  // G 报销总额值
    { wch: 8.88 },   // H 报销总额标签
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

  // 导出文件
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
