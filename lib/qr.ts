import QRCode from "qrcode";

/**
 * Renders a text/URL as a QR code PNG data URL. Runs on the server, so the
 * homepage can embed the images without any client-side JavaScript.
 */
export async function qrCodeDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: 280,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#14161d", light: "#ffffff" },
  });
}
