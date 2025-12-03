declare module '@paddlejs-models/ocr' {
  /**
   * OCR recognition options
   */
  interface RecognizeOption {
    /** Canvas element for drawing text box regions */
    canvas?: HTMLCanvasElement;
    /** Style options for the canvas */
    style?: {
      /** Color for the text box stroke */
      strokeStyle?: string;
      /** Width of the text box line segment */
      lineWidth?: number;
      /** Fill color for the text box */
      fillStyle?: string;
    };
  }

  /**
   * OCR recognition result
   */
  interface RecognizeResult {
    /** Array of recognized text strings */
    text: string[];
    /** Array of text area points (bounding boxes) */
    points: number[][][];
  }

  /**
   * Initialize the OCR models (detection and recognition)
   * @param detModelPath Optional custom detection model path
   * @param recModelPath Optional custom recognition model path
   */
  export function init(detModelPath?: string, recModelPath?: string): Promise<void>;

  /**
   * Perform text recognition on an image
   * @param img Image element to recognize
   * @param option Optional recognition options
   * @returns Recognition result with text and points
   */
  export function recognize(
    img: HTMLImageElement,
    option?: RecognizeOption
  ): Promise<RecognizeResult>;

  /**
   * Perform text detection on an image (without recognition)
   * @param img Image element to detect text in
   * @returns Array of text area points (bounding boxes)
   */
  export function detect(img: HTMLImageElement): Promise<number[][][]>;
}
