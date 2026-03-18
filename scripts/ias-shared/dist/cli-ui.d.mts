export type CliFormat = "human" | "json";
export type ColorMode = "auto" | "always" | "never";
export type Verbosity = "quiet" | "normal" | "verbose";
export type UiLineKind = "info" | "success" | "warn" | "error";
export type ChecklistItem = {
    label: string;
    kind: UiLineKind | "todo";
    detail?: string;
};
export type TableColumn = {
    key: string;
    header: string;
    align?: "left" | "right";
};
export type Spinner = {
    start: () => void;
    update: (text: string) => void;
    stop: (finalText?: string) => void;
};
export type Ui = {
    format: CliFormat;
    colorEnabled: boolean;
    interactive: boolean;
    verbosity: Verbosity;
    header: (title: string, subtitle?: string) => void;
    section: (title: string) => void;
    line: (kind: UiLineKind, message: string) => void;
    info: (message: string) => void;
    success: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
    checklist: (items: ChecklistItem[]) => void;
    table: (columns: TableColumn[], rows: Record<string, any>[]) => void;
    link: (url: string, label?: string) => string;
    spinner: (initialText: string) => Spinner;
    json: (value: any) => void;
    jsonError: (message: string, extras?: Record<string, any>) => void;
};
export declare function stripAnsi(text: string): string;
export declare function parseCommonCliOptions(argv: string[], env?: Record<string, string | undefined>): {
    argv: string[];
    format: CliFormat;
    colorMode: ColorMode;
    verbosity: Verbosity;
};
export declare function createUi({ argv, env, stdinIsTTY, stdoutIsTTY, stdout, stderr, }: {
    argv: string[];
    env?: Record<string, string | undefined>;
    stdinIsTTY: boolean;
    stdoutIsTTY: boolean;
    stdout?: NodeJS.WriteStream;
    stderr?: NodeJS.WriteStream;
}): Ui;
//# sourceMappingURL=cli-ui.d.mts.map