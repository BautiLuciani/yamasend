import { respuestaMetadata, respuestaOptions } from "./metadata";

export function GET(req: Request) {
  return respuestaMetadata(req);
}

export function OPTIONS() {
  return respuestaOptions();
}
