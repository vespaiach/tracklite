import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { createFirstAdmin } from "../src/server/setup";

async function ask(question: string) {
  const prompt = createInterface({ input: stdin, output: stdout });
  const answer = await prompt.question(question);
  prompt.close();
  return answer;
}

function askHidden(question: string) {
  return new Promise<string>((resolve) => {
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    let answer = "";
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === "\u0003") process.exit(130);
        if (character === "\r" || character === "\n") {
          stdin.off("data", onData);
          stdin.setRawMode(false);
          stdin.pause();
          stdout.write("\n");
          resolve(answer);
          return;
        }
        answer = character === "\u007f" ? [...answer].slice(0, -1).join("") : answer + character;
      }
    };
    stdin.on("data", onData);
  });
}

if (!stdin.isTTY) {
  console.error("Run the setup command in a terminal.");
  process.exit(1);
}

const email = await ask("Email: ");
const fullName = await ask("Full name: ");
const username = await ask("Username: ");
const password = await askHidden("Password: ");
if ((await askHidden("Password again: ")) !== password) {
  console.error("The passwords don't match.");
  process.exit(1);
}

try {
  await createFirstAdmin({ email, fullName, username, password });
  console.log(`Created the admin ${email}. Sign in with that email and password.`);
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}