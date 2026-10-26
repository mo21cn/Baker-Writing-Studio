import { autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { SLASH_COMMANDS } from "../core/editor/slashCommands";
import { applySlashInsert } from "../core/editor/applyInsert";

/** `r2md:pick-image` asks the host pane to open its file picker. */
export const PICK_IMAGE_EVENT = "r2md:pick-image";

function slashSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/\/[\u4e00-\u9fa5A-Za-z]{0,8}/);
  if (!word || word.text.length === 0) return null;

  return {
    from: word.from,
    options: SLASH_COMMANDS.map((command) => ({
      label: `/${command.label}`,
      detail: command.description,
      type: "keyword",
      apply: (view: EditorView, _completion, from: number, to: number) => {
        if (command.kind === "image") {
          // The picker needs a real user gesture from the host pane.
          view.dispatch({ changes: { from, to, insert: "" } });
          view.dom.dispatchEvent(new CustomEvent(PICK_IMAGE_EVENT, { bubbles: true }));
          return;
        }
        applySlashInsert(view, command.kind, from, to);
      },
    })),
    validFor: /^\/[\u4e00-\u9fa5A-Za-z]{0,8}$/,
  };
}

/**
 * Typing `/` in the editor offers the same five inserts as the header menu.
 * The list is deliberately exclusive (`override`): Markdown has no other
 * completions, and mixing sources would surface noise.
 */
export const slashCommands = autocompletion({
  override: [slashSource],
  icons: false,
  activateOnTyping: true,
});
