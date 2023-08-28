import { Client } from "../client.ts";
import {
  EditorView,
  foldAll,
  foldCode,
  toggleFold,
  Transaction,
  unfoldAll,
  unfoldCode,
  Vim,
  vimGetCm,
} from "../deps.ts";
import { SysCallMapping } from "../../plugos/system.ts";
import type { FilterOption } from "../types.ts";

export function editorSyscalls(editor: Client): SysCallMapping {
  const syscalls: SysCallMapping = {
    "editor.getCurrentPage": (): string => {
      return editor.currentPage!;
    },
    "editor.getText": () => {
      return editor.editorView.state.sliceDoc();
    },
    "editor.getCursor": (): number => {
      return editor.editorView.state.selection.main.from;
    },
    "editor.getSelection": (): { from: number; to: number } => {
      return editor.editorView.state.selection.main;
    },
    "editor.save": () => {
      return editor.save(true);
    },
    "editor.navigate": async (
      _ctx,
      name: string,
      pos: number | string,
      replaceState = false,
      newWindow = false,
    ) => {
      await editor.navigate(name, pos, replaceState, newWindow);
    },
    "editor.reloadPage": async () => {
      await editor.reloadPage();
    },
    "editor.reloadUI": () => {
      location.reload();
    },
    "editor.openUrl": (_ctx, url: string, existingWindow = false) => {
      if (!existingWindow) {
        const win = window.open(url, "_blank");
        if (win) {
          win.focus();
        }
      } else {
        location.href = url;
      }
    },
    "editor.downloadFile": (_ctx, filename: string, dataUrl: string) => {
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = filename;
      link.click();
    },
    "editor.flashNotification": (
      _ctx,
      message: string,
      type: "error" | "info" = "info",
    ) => {
      editor.flashNotification(message, type);
    },
    "editor.filterBox": (
      _ctx,
      label: string,
      options: FilterOption[],
      helpText = "",
      placeHolder = "",
    ): Promise<FilterOption | undefined> => {
      return editor.filterBox(label, options, helpText, placeHolder);
    },
    "editor.showPanel": (
      _ctx,
      id: string,
      mode: number,
      html: string,
      script: string,
    ) => {
      editor.ui.viewDispatch({
        type: "show-panel",
        id: id as any,
        config: { html, script, mode },
      });
    },
    "editor.hidePanel": (_ctx, id: string) => {
      editor.ui.viewDispatch({
        type: "hide-panel",
        id: id as any,
      });
    },
    "editor.insertAtPos": (_ctx, text: string, pos: number) => {
      editor.editorView.dispatch({
        changes: {
          insert: text,
          from: pos,
        },
      });
    },
    "editor.replaceRange": (_ctx, from: number, to: number, text: string) => {
      editor.editorView.dispatch({
        changes: {
          insert: text,
          from: from,
          to: to,
        },
      });
    },
    "editor.moveCursor": (_ctx, pos: number, center = false) => {
      editor.editorView.dispatch({
        selection: {
          anchor: pos,
        },
      });
      if (center) {
        editor.editorView.dispatch({
          effects: [
            EditorView.scrollIntoView(
              pos,
              {
                y: "center",
              },
            ),
          ],
        });
      }
    },
    "editor.setSelection": (_ctx, from: number, to: number) => {
      editor.editorView.dispatch({
        selection: {
          anchor: from,
          head: to,
        },
      });
    },

    "editor.insertAtCursor": (_ctx, text: string) => {
      const editorView = editor.editorView;
      const from = editorView.state.selection.main.from;
      editorView.dispatch({
        changes: {
          insert: text,
          from: from,
        },
        selection: {
          anchor: from + text.length,
        },
      });
    },
    "editor.dispatch": (_ctx, change: Transaction) => {
      editor.editorView.dispatch(change);
    },
    "editor.prompt": (
      _ctx,
      message: string,
      defaultValue = "",
    ): Promise<string | undefined> => {
      return editor.prompt(message, defaultValue);
    },
    "editor.confirm": (
      _ctx,
      message: string,
    ): Promise<boolean> => {
      return editor.confirm(message);
    },
    "editor.getUiOption": (_ctx, key: string): any => {
      if (key === "thinClientMode") {
        return !!localStorage.getItem("thinClientMode");
      }
      return (editor.ui.viewState.uiOptions as any)[key];
    },
    "editor.setUiOption": (_ctx, key: string, value: any) => {
      if (key === "thinClientMode") {
        if (value) {
          localStorage.setItem("thinClientMode", "true");
        } else {
          localStorage.removeItem("thinClientMode");
        }
        return;
      }
      editor.ui.viewDispatch({
        type: "set-ui-option",
        key,
        value,
      });
    },
    "editor.vimEx": (_ctx, exCommand: string) => {
      const cm = vimGetCm(editor.editorView)!;
      return Vim.handleEx(cm, exCommand);
    },
    // Folding
    "editor.fold": () => {
      foldCode(editor.editorView);
    },
    "editor.unfold": () => {
      unfoldCode(editor.editorView);
    },
    "editor.toggleFold": () => {
      toggleFold(editor.editorView);
    },
    "editor.foldAll": () => {
      foldAll(editor.editorView);
    },
    "editor.unfoldAll": () => {
      unfoldAll(editor.editorView);
    },
  };

  return syscalls;
}
