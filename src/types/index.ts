// 发票类型
export type InvoiceType =
  | 'intercity_transport'  // 城市间交通（火车票、飞机票）
  | 'intracity_transport'  // 城市内交通（打车）
  | 'accommodation'        // 住宿
  | 'registration_fee';    // 报名费

export const InvoiceTypeLabels: Record<InvoiceType, string> = {
  intercity_transport: '城市间交通',
  intracity_transport: '城市内交通',
  accommodation: '住宿',
  registration_fee: '报名费',
};

// 发票信息
export interface InvoiceInfo {
  id: string;
  fileName: string;
  type: InvoiceType | null;
  amount: number | null;
  date: string | null;
  description: string | null;
  rawText?: string;
  file?: File;
  imageBase64?: string;
  parseStatus: 'pending' | 'parsing' | 'success' | 'error';
  errorMessage?: string;
}

// 人员信息
export interface PersonInfo {
  id: string;
  name: string;
  employeeId: string;  // 工号/学号
  invoices: InvoiceInfo[];
}

// LLM配置
export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  modelName: string;
}

// 导出数据行
export interface ExportRow {
  name: string;
  employeeId: string;
  invoiceType: string;
  amount: number;
  date: string;
  description: string;
}
