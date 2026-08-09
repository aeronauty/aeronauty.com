export class TileTallyHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly publicMessage: string;

  constructor(status: number, code: string, publicMessage: string) {
    super(code);
    this.name = "TileTallyHttpError";
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
  }
}
