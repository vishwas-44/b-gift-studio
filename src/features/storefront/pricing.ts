export function calculateSubtotal(lines: ReadonlyArray<{ unitPrice: number; quantity: number }>) {
  return lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
}
