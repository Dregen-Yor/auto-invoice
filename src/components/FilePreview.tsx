import React, { useState, useEffect, useRef } from 'react';
import { Image, Modal } from 'antd';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// 设置 PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface FilePreviewProps {
  fileName: string;
  base64?: string; // base64 content without prefix
  width?: number | string;
  height?: number | string;
}

const getMimeType = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    'pdf': 'application/pdf',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
};

export const FilePreview: React.FC<FilePreviewProps> = ({ fileName, base64, width = 40, height = 40 }) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mimeType = getMimeType(fileName);
  const isPdf = mimeType === 'application/pdf';

  useEffect(() => {
    let mounted = true;

    if (isPdf && base64) {
      const renderPdf = async () => {
        try {
          // 将 base64 转换为 Uint8Array
          const binaryString = window.atob(base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          const loadingTask = pdfjsLib.getDocument({ data: bytes });
          const pdf = await loadingTask.promise;
          const page = await pdf.getPage(1);

          if (!mounted || !canvasRef.current) return;

          // 计算缩放比例
          // 目标是生成一个清晰的缩略图，然后在容器中缩放显示
          const desiredWidth = 200; // 渲染宽度
          const viewport = page.getViewport({ scale: 1.0 });
          const scale = desiredWidth / viewport.width;
          const scaledViewport = page.getViewport({ scale });

          const canvas = canvasRef.current;
          const context = canvas.getContext('2d');

          canvas.height = scaledViewport.height;
          canvas.width = scaledViewport.width;

          if (context) {
             await page.render({
              canvasContext: context,
              viewport: scaledViewport,
            }).promise;
          }
        } catch (error) {
          console.error('Error rendering PDF thumbnail:', error);
        }
      };
      renderPdf();
    }

    return () => {
      mounted = false;
    };
  }, [isPdf, base64]);

  if (!base64) return null;

  const src = `data:${mimeType};base64,${base64}`;

  if (isPdf) {
    return (
      <>
        <div
          onClick={() => setPreviewOpen(true)}
          style={{
            cursor: 'pointer',
            width,
            height,
            overflow: 'hidden',
            borderRadius: 4,
            border: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fafafa'
          }}
          title="点击预览PDF"
        >
          <canvas 
            ref={canvasRef} 
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: 'contain' 
            }} 
          />
        </div>
        <Modal
          open={previewOpen}
          onCancel={() => setPreviewOpen(false)}
          footer={null}
          width="80%"
          centered
          destroyOnClose
          title={fileName}
        >
           <div style={{ height: '80vh', width: '100%' }}>
             <iframe 
               src={src} 
               style={{ width: '100%', height: '100%', border: 'none' }} 
               title={fileName}
             />
           </div>
        </Modal>
      </>
    );
  }

  return (
    <Image
      src={src}
      width={width}
      height={height}
      style={{ objectFit: 'cover', borderRadius: 4 }}
      preview={{
        src: src,
      }}
    />
  );
};

