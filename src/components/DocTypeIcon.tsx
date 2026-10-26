import type { DocumentSource } from "../core/document/documentTypes";

/**
 * The small chip in the document list that shows which editor a document
 * belongs to. Same artwork as the rail icons, so the mapping is learned
 * once.
 */
const PATHS: Partial<Record<DocumentSource, string[]>> = {
  latex: ["M17 5H8l6 7-6 7h9"],
  table: ["M4 5h16v14H4z", "M4 10h16M10 10v9"],
  wechat: ["M4 11a6 6 0 1 1 3 5.2L4 18l.8-3.4A5.9 5.9 0 0 1 4 11z", "M11 9h6", "M11 13h4"],
};

export function DocTypeIcon({ source }: { source: DocumentSource }) {
  const paths = PATHS[source];
  if (!paths) {
    // markdown / blank / html documents use the plain file mark
    return (
      <svg className="doc-type-icon" viewBox="0 0 24 24" aria-hidden>
        <path d="M4 4h11l5 5v11H4z" />
        <path d="M15 4v5h5" />
        <path d="M8 13h8M8 17h5" />
      </svg>
    );
  }

  return (
    <svg className="doc-type-icon doc-type-icon-tool" viewBox="0 0 24 24" aria-hidden>
      {paths.map((path, index) => (
        <path key={index} d={path} />
      ))}
    </svg>
  );
}
