import type { Hook, Manifest } from "$lib/plugos/types.ts";
import type { System } from "$lib/plugos/system.ts";
import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import type { Client } from "../client.ts";
import { syntaxTree } from "@codemirror/language";
import type {
  SlashCompletionOption,
  SlashCompletions,
} from "../../plug-api/types.ts";
import { safeRun, throttle } from "$lib/async.ts";
import type { SlashCommandDef, SlashCommandHookT } from "$lib/manifest.ts";
import type { Shortcut } from "@silverbulletmd/silverbullet/type/client";

export type AppSlashCommand = {
  slashCommand: SlashCommandDef;
  run: () => Promise<void>;
};

const slashCommandRegexp = /([^\w:]|^)\/[\w#\-]*/;

export class SlashCommandHook implements Hook<SlashCommandHookT> {
  slashCommands: AppSlashCommand[] = [];

  constructor(private client: Client) {
  }

  throttledBuildAllCommands = throttle(() => {
    this.buildAllCommands();
  }, 200);

  buildAllCommands() {
    const clientSystem = this.client.clientSystem;
    const system = clientSystem.system;

    this.slashCommands = [];
    for (const plug of system.loadedPlugs.values()) {
      for (
        const [name, functionDef] of Object.entries(
          plug.manifest!.functions,
        )
      ) {
        if (!functionDef.slashCommand) {
          continue;
        }
        const cmd = functionDef.slashCommand;
        this.slashCommands.push({
          slashCommand: cmd,
          run: () => {
            return plug.invoke(name, [cmd]);
          },
        });
      }
    }
    // Iterate over script defined slash commands
    for (
      const command of Object.values(
        clientSystem.scriptEnv.slashCommands,
      )
    ) {
      this.slashCommands.push(command);
    }
    // Iterate over all shortcuts
    // Add slash commands for shortcuts that configure them
    for (
      const shortcut of this.client.config.get<Shortcut[]>("shortcuts", [])
    ) {
      if (shortcut.slashCommand) {
        this.slashCommands.push({
          slashCommand: {
            name: shortcut.slashCommand,
            description: shortcut.command,
          },
          run: () => this.client.runCommandByName(shortcut.command),
        });
      }
    }
  }

  // Completer for CodeMirror
  public async slashCommandCompleter(
    ctx: CompletionContext,
  ): Promise<CompletionResult | null> {
    const prefix = ctx.matchBefore(slashCommandRegexp);
    if (!prefix) {
      return null;
    }
    const prefixText = prefix.text;
    const options: Completion[] = [];

    // No slash commands in comment blocks (queries and such) or links
    const currentNode = syntaxTree(ctx.state).resolveInner(ctx.pos);
    if (
      currentNode.type.name === "CommentBlock" ||
      currentNode.type.name === "Link"
    ) {
      return null;
    }

    // Check if the slash command is available in the current context
    const parentNodes = this.client.extractParentNodes(ctx.state, currentNode);
    for (const def of this.slashCommands) {
      if (
        def.slashCommand.onlyContexts && !def.slashCommand.onlyContexts.some(
          (context) => parentNodes.some((node) => node.startsWith(context)),
        )
      ) {
        continue;
      }
      if (
        def.slashCommand.exceptContexts && def.slashCommand.exceptContexts.some(
          (context) => parentNodes.some((node) => node.startsWith(context)),
        )
      ) {
        continue;
      }
      options.push({
        label: def.slashCommand.name,
        detail: def.slashCommand.description,
        boost: def.slashCommand.boost,
        apply: () => {
          // Delete slash command part
          this.client.editorView.dispatch({
            changes: {
              from: prefix!.from + prefixText.indexOf("/"),
              to: ctx.pos,
              insert: "",
            },
          });
          // Replace with whatever the completion is
          safeRun(async () => {
            await def.run();
            this.client.focus();
          });
        },
      });
    }

    const slashCompletions: CompletionResult | SlashCompletions | null =
      await this.client
        .completeWithEvent(
          ctx,
          "slash:complete",
        );

    if (slashCompletions) {
      for (
        const slashCompletion of slashCompletions
          .options as SlashCompletionOption[]
      ) {
        options.push({
          label: slashCompletion.label,
          detail: slashCompletion.detail,
          boost: slashCompletion.order && -slashCompletion.order,
          apply: () => {
            // Delete slash command part
            this.client.editorView.dispatch({
              changes: {
                from: prefix!.from + prefixText.indexOf("/"),
                to: ctx.pos,
                insert: "",
              },
            });
            // Replace with whatever the completion is
            safeRun(async () => {
              await this.client.clientSystem.system.invokeFunction(
                slashCompletion.invoke,
                [slashCompletion],
              );
              this.client.focus();
            });
          },
        });
      }
    }

    return {
      // + 1 because of the '/'
      from: prefix.from + prefixText.indexOf("/") + 1,
      options: options,
    };
  }

  apply(system: System<SlashCommandHookT>): void {
    this.buildAllCommands();
    system.on({
      plugLoaded: () => {
        this.buildAllCommands();
      },
    });
  }

  validateManifest(manifest: Manifest<SlashCommandHookT>): string[] {
    const errors = [];
    for (const [name, functionDef] of Object.entries(manifest.functions)) {
      if (!functionDef.slashCommand) {
        continue;
      }
      const cmd = functionDef.slashCommand;
      if (!cmd.name) {
        errors.push(`Function ${name} has a command but no name`);
      }
    }
    return [];
  }
}
