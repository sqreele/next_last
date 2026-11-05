import DemoShell from "./DemoShell";
import { DemoProvider } from "./DemoProvider";

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <DemoProvider><DemoShell>{children}</DemoShell></DemoProvider>;
}
