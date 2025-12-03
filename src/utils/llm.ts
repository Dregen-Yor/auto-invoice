import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import Tesseract from 'tesseract.js';
import OpenAI from 'openai';
import type { LLMConfig, InvoiceInfo, InvoiceType } from '../types';

// 设置 PDF.js worker（使用本地文件）
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// 将文件转换为base64
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
  });
}

// 将文件转换为 ArrayBuffer
async function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
  });
}

// 使用 Tesseract.js 进行 OCR 识别
async function recognizeTextWithOCR(imageData: string): Promise<string> {
  const result = await Tesseract.recognize(
    imageData,
    'chi_sim+eng', // 支持中文简体和英文
  );
  return result.data.text.trim();
}

// 从 PDF 提取文字（使用 OCR）
export async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await fileToArrayBuffer(file);
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    
    // 获取页面尺寸
    const viewport = page.getViewport({ scale: 2.0 }); // 使用2倍缩放以获得更好的OCR效果
    
    // 创建 canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('无法创建 canvas context');
    }
    
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    // 渲染 PDF 页面到 canvas
    await page.render({
      canvasContext: context,
      viewport: viewport,
      canvas: canvas,
    }).promise;
    
    // 将 canvas 转换为图片 data URL
    const imageData = canvas.toDataURL('image/png');
    
    // 使用 Tesseract.js 进行 OCR 识别
    const pageText = await recognizeTextWithOCR(imageData);
    fullText += pageText + '\n';
  }

  return fullText.trim();
}

// 从图片提取文字（使用 OCR）
export async function extractTextFromImage(imageBase64: string, mimeType: string = 'image/jpeg'): Promise<string> {
  const imageData = `data:${mimeType};base64,${imageBase64}`;
  return recognizeTextWithOCR(imageData);
}

// 判断文件是否为 PDF
function isPDF(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

// 创建 OpenAI 客户端
function createOpenAIClient(config: LLMConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    dangerouslyAllowBrowser: true,
  });
}

// 解析提示词
const PARSE_PROMPT = `请分析以下发票/票据内容，提取信息并以JSON格式返回：

请提取以下信息：
1. type: 发票类型，必须是以下之一：
   - "intercity_transport" (城市间交通：火车票、飞机票、高铁票等)
   - "intracity_transport" (城市内交通：出租车、网约车、地铁、公交等)
   - "accommodation" (住宿：酒店、宾馆等)
   - "registration_fee" (报名费：会议注册费、培训费等)

2. amount: 金额（数字，不带货币符号）

3. date: 日期（格式：YYYY-MM-DD）

4. description: 简要描述（如：北京-上海火车票、滴滴打车、XX酒店住宿等）

请只返回JSON对象，不要有其他文字。如果某项信息无法识别，请设为null。

示例返回格式：
{
  "type": "intercity_transport",
  "amount": 553.5,
  "date": "2024-03-15",
  "description": "北京-上海高铁票"
}`;

// 调用LLM解析发票（纯文本模式）
async function parseWithTextMode(
  config: LLMConfig,
  text: string
): Promise<Partial<InvoiceInfo>> {
  const client = createOpenAIClient(config);

  const response = await client.chat.completions.create({
    model: config.modelName,
    messages: [
      {
        role: 'user',
        content: `${PARSE_PROMPT}\n\n发票内容：\n${text}`,
      },
    ],
    max_tokens: 8192,
  });

  console.log('API 响应:', JSON.stringify(response, null, 2));

  // 兼容不同 API 返回格式
  const resp = response as unknown as Record<string, unknown>;
  let content: string | null = null;

  // OpenAI 标准格式
  if (response.choices?.[0]?.message?.content) {
    content = response.choices[0].message.content;
  }
  // 其他可能的格式
  else if (typeof resp.content === 'string') {
    content = resp.content;
  } else if (typeof resp.result === 'string') {
    content = resp.result;
  } else if (resp.result && typeof (resp.result as Record<string, unknown>).content === 'string') {
    content = (resp.result as Record<string, unknown>).content as string;
  }

  if (!content) {
    throw new Error(`API返回格式不支持: ${JSON.stringify(response).slice(0, 500)}`);
  }

  return parseJSONResponse(content);
}

// 解析 JSON 响应
function parseJSONResponse(content: string): Partial<InvoiceInfo> {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`无法从返回内容中提取JSON: ${content.slice(0, 200)}`);
  }

  const parsed = JSON.parse(jsonMatch[0]);

  const validTypes: InvoiceType[] = [
    'intercity_transport',
    'intracity_transport',
    'accommodation',
    'registration_fee',
  ];

  return {
    type: validTypes.includes(parsed.type) ? parsed.type : null,
    amount: typeof parsed.amount === 'number' ? parsed.amount : (parseFloat(parsed.amount) || null),
    date: parsed.date || null,
    description: parsed.description || null,
    rawText: content,
  };
}

// 调用LLM解析发票
export async function parseInvoiceWithLLM(
  config: LLMConfig,
  invoice: InvoiceInfo
): Promise<Partial<InvoiceInfo>> {
  if (!invoice.file) {
    throw new Error('没有可解析的文件');
  }

  // 如果是 PDF，使用 OCR 提取文字后用纯文本模式解析
  if (isPDF(invoice.file)) {
    const text = await extractTextFromPDF(invoice.file);
    if (!text) {
      throw new Error('PDF OCR 识别失败，无法提取文字');
    }
    return parseWithTextMode(config, text);
  }

  // 对于图片，使用 OCR 提取文字后用纯文本模式解析
  if (!invoice.imageBase64) {
    throw new Error('没有可解析的图片');
  }

  // 获取图片 MIME 类型
  const ext = invoice.file.name.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
  };
  const mimeType = mimeTypes[ext || ''] || invoice.file.type || 'image/jpeg';

  const text = await extractTextFromImage(invoice.imageBase64, mimeType);
  if (!text) {
    throw new Error('图片 OCR 识别失败，无法提取文字');
  }
  return parseWithTextMode(config, text);
}
