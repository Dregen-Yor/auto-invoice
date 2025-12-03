import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
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

// 从 PDF 提取文字
export async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await fileToArrayBuffer(file);
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: unknown) => (item as { str: string }).str)
      .join(' ');
    fullText += pageText + '\n';
  }

  return fullText.trim();
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

  // 尝试使用视觉模式（文件上传）
  if (invoice.imageBase64) {
    try {
      return await parseWithVisionMode(config, invoice);
    } catch (error) {
      // 如果不是PDF，或者错误是致命的（非API不支持错误），则抛出异常
      // 这里我们假设如果是PDF，则尝试回退到文本模式
      // 但对于图片，如果没有其他解析方式，则抛出错误
      if (!isPDF(invoice.file)) {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        if (errorMessage.includes('400') || errorMessage.includes('参数')) {
          throw new Error('当前 API 不支持图片识别，请上传 PDF 格式的发票，或使用支持视觉功能的模型');
        }
        throw error;
      }
      // 如果是PDF且视觉模式失败，继续执行下方的PDF提取逻辑
      console.warn('视觉模式解析失败，尝试回退到文本模式:', error);
    }
  } else if (!isPDF(invoice.file)) {
     throw new Error('没有可解析的图片或PDF');
  }

  // 如果是 PDF，提取文字后用纯文本模式解析
  if (isPDF(invoice.file)) {
    const text = await extractTextFromPDF(invoice.file);
    if (!text) {
      throw new Error('PDF 文字提取失败，文件可能是扫描件');
    }
    return parseWithTextMode(config, text);
  }

  throw new Error('不支持的文件格式');
}

// 视觉模式解析
async function parseWithVisionMode(
  config: LLMConfig,
  invoice: InvoiceInfo
): Promise<Partial<InvoiceInfo>> {
  const client = createOpenAIClient(config);

  const ext = invoice.file!.name.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
  };
  const mimeType = mimeTypes[ext || ''] || invoice.file!.type || 'image/jpeg';

  const response = await client.chat.completions.create({
    model: config.modelName,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${invoice.imageBase64}`,
            },
          },
          {
            type: 'text',
            text: PARSE_PROMPT,
          },
        ],
      },
    ],
    max_tokens: 4096,
  });

  const message = response.choices[0]?.message;
  const content = message?.content || (message as unknown as { reasoning_content?: string })?.reasoning_content;

  if (!content) {
    throw new Error('API返回内容为空');
  }

  return parseJSONResponse(content);
}
