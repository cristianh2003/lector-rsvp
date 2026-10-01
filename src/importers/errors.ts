/** Error de importación con un mensaje pensado para mostrarse tal cual al usuario. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}
