/**
 * Table data model — pure, store-agnostic.
 *
 * The table tool page is intentionally not coupled to editorStore. The model
 * lives in its own module so the parser / serializer can be reused by any
 * caller (a CodeMirror extension, a future Excel importer, etc.).
 *
 * Cells are stored as a flat `string[][]` indexed by [row][col]. We pad short
 * rows to the widest row length so the serializer can assume a uniform shape.
 */
export interface TableModel {
  /** Row-major cell values. */
  cells: string[][];
  /** Number of columns (derived from cells, kept explicit for empty tables). */
  cols: number;
  /** When true, the first row is rendered as the table header. */
  headerRow: boolean;
}

export function createEmptyTable(cols = 3, rows = 3): TableModel {
  const safeCols = Math.max(1, Math.floor(cols));
  const safeRows = Math.max(1, Math.floor(rows));
  return {
    cells: Array.from({ length: safeRows }, () =>
      Array.from({ length: safeCols }, () => ""),
    ),
    cols: safeCols,
    headerRow: true,
  };
}

export function normalizeTable(model: TableModel): TableModel {
  const cols = Math.max(
    1,
    model.cells.reduce((max, row) => Math.max(max, row.length), model.cols),
  );
  const cells = model.cells.map((row) => {
    const padded = row.slice(0, cols);
    while (padded.length < cols) {
      padded.push("");
    }
    return padded;
  });
  if (cells.length === 0) {
    cells.push(Array.from({ length: cols }, () => ""));
  }
  return { cells, cols, headerRow: model.headerRow };
}

export function cellAt(model: TableModel, row: number, col: number): string {
  return model.cells[row]?.[col] ?? "";
}

export function setCell(model: TableModel, row: number, col: number, value: string): TableModel {
  const cells = model.cells.map((line, index) => {
    if (index !== row) {
      return line;
    }
    const next = line.slice();
    next[col] = value;
    return next;
  });
  return normalizeTable({ ...model, cells });
}

export function addRow(model: TableModel): TableModel {
  const cells = [...model.cells, Array.from({ length: model.cols }, () => "")];
  return normalizeTable({ ...model, cells });
}

export function addColumn(model: TableModel): TableModel {
  const cells = model.cells.map((row) => [...row, ""]);
  return { cells, cols: model.cols + 1, headerRow: model.headerRow };
}

export function removeRow(model: TableModel, row: number): TableModel {
  if (model.cells.length <= 1) {
    return model;
  }
  const cells = model.cells.filter((_, index) => index !== row);
  return normalizeTable({ ...model, cells });
}

export function removeColumn(model: TableModel, col: number): TableModel {
  if (model.cols <= 1) {
    return model;
  }
  const cells = model.cells.map((row) => row.filter((_, index) => index !== col));
  return { cells, cols: model.cols - 1, headerRow: model.headerRow };
}
