import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

let activeRl: readline.Interface | null = null;

function getRl(): readline.Interface {
  if (!activeRl) {
    activeRl = readline.createInterface({ input, output, terminal: true });
  }
  return activeRl;
}

export async function ask(question: string, defaultValue = ""): Promise<string> {
  const suffix = defaultValue ? `（默认：${defaultValue}）` : "";
  const answer = (await getRl().question(`${question}${suffix}\n> `)).trim();
  return answer || defaultValue;
}

export async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = (await getRl().question(`${question} [${hint}]\n> `)).trim().toLowerCase();
  if (!answer) {
    return defaultYes;
  }
  return answer === "y" || answer === "yes" || answer === "是";
}

export interface MenuOption<T extends string = string> {
  value: T;
  label: string;
  hint?: string;
}

export async function choose<T extends string>(
  title: string,
  options: Array<MenuOption<T>>,
): Promise<T> {
  if (options.length === 0) {
    throw new Error("没有可选项。");
  }

  while (true) {
    output.write(`\n${title}\n`);
    options.forEach((option, index) => {
      const hint = option.hint ? `  — ${option.hint}` : "";
      output.write(`  ${index + 1}. ${option.label}${hint}\n`);
    });
    const raw = (await getRl().question("请输入序号：\n> ")).trim();
    const index = Number(raw);
    if (Number.isInteger(index) && index >= 1 && index <= options.length) {
      return options[index - 1]!.value;
    }
    output.write("序号无效，请重新选择。\n");
  }
}

export function closePrompt(): void {
  if (activeRl) {
    activeRl.close();
    activeRl = null;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
