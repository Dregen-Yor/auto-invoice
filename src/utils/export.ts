import * as XLSX from 'xlsx';
import type { PersonInfo, ExportRow } from '../types';
import { InvoiceTypeLabels } from '../types';

// 差旅明细信息
export interface TravelInfo {
  competitionName: string;  // 竞赛名称
  time: string;             // 时间
  location: string;         // 地点
  teamName: string;         // 队伍名称
  remarks: string;          // 备注
}

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

// 按差旅明细模板格式导出
export function exportSummaryToExcel(
  persons: PersonInfo[],
  travelInfo: TravelInfo,
  filename: string = '差旅明细'
) {
  // 按人员汇总
  const summaryMap = new Map<string, { name: string; employeeId: string; totals: Record<string, number> }>();

  for (const person of persons) {
    const key = `${person.name}-${person.employeeId}`;
    if (!summaryMap.has(key)) {
      summaryMap.set(key, {
        name: person.name,
        employeeId: person.employeeId,
        totals: {
          intercity_transport: 0,
          intracity_transport: 0,
          accommodation: 0,
          registration_fee: 0,
        },
      });
    }

    const summary = summaryMap.get(key)!;
    for (const invoice of person.invoices) {
      if (invoice.parseStatus === 'success' && invoice.type && invoice.amount) {
        summary.totals[invoice.type] += invoice.amount;
      }
    }
  }

  const summaries = Array.from(summaryMap.values());

  // 计算小计
  const subtotals = {
    intercity_transport: 0,
    intracity_transport: 0,
    accommodation: 0,
    registration_fee: 0,
  };

  summaries.forEach(s => {
    subtotals.intercity_transport += s.totals.intercity_transport;
    subtotals.intracity_transport += s.totals.intracity_transport;
    subtotals.accommodation += s.totals.accommodation;
    subtotals.registration_fee += s.totals.registration_fee;
  });

  const totalAmount = Object.values(subtotals).reduce((a, b) => a + b, 0);

  // 创建工作表数据，按模板格式
  const worksheetData: (string | number | null)[][] = [
    // 表头
    ['姓名', '学号', '城市间交通费', '住宿费', '市内交通费', '报名费'],
  ];

  // 人员数据行
  summaries.forEach(summary => {
    worksheetData.push([
      summary.name,
      summary.employeeId,
      summary.totals.intercity_transport || null,
      summary.totals.accommodation || null,
      summary.totals.intracity_transport || null,
      summary.totals.registration_fee || null,
    ]);
  });

  // 添加空行直到第6行（确保至少有5行数据行）
  while (worksheetData.length < 6) {
    worksheetData.push([]);
  }

  // 小计行
  worksheetData.push([
    '小计',
    null,
    subtotals.intercity_transport || null,
    subtotals.accommodation || null,
    subtotals.intracity_transport || null,
    subtotals.registration_fee || null,
    null,
    '报销总额',
    totalAmount,
  ]);

  // 空行
  worksheetData.push([]);

  // 竞赛信息
  worksheetData.push([`竞赛名称：${travelInfo.competitionName}`]);
  worksheetData.push([`时间：${travelInfo.time}`]);
  worksheetData.push([`地点：${travelInfo.location}`]);
  worksheetData.push([`队伍名称：${travelInfo.teamName}`]);
  worksheetData.push([`备注（问题反馈等）${travelInfo.remarks ? '：' + travelInfo.remarks : ''}`]);

  // 创建工作簿
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  // 设置列宽
  worksheet['!cols'] = [
    { wch: 12 },  // 姓名
    { wch: 15 },  // 学号
    { wch: 14 },  // 城市间交通费
    { wch: 12 },  // 住宿费
    { wch: 14 },  // 市内交通费
    { wch: 12 },  // 报名费
    { wch: 5 },   // 空列
    { wch: 12 },  // 报销总额标签
    { wch: 12 },  // 报销总额值
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

  // 导出文件
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
