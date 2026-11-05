import DemoShell from "./DemoShell";
import { DemoProvider } from "./DemoProvider";
import { DemoLanguageProvider } from "./DemoLanguageProvider";

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <DemoLanguageProvider><DemoProvider><DemoShell>{children}</DemoShell></DemoProvider></DemoLanguageProvider>;
}
