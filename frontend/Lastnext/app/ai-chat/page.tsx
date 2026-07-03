import AiChatBox from '@/app/components/ai/AiChatBox';
import AiChatDesktopNav from '@/app/components/ai/AiChatDesktopNav';
import AiChatMobileMenu from '@/app/components/ai/AiChatMobileMenu';

export default function AiChatPage() {
  return (
    <main className="flex min-h-screen bg-slate-100">
      <AiChatDesktopNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <AiChatMobileMenu />
        <div className="px-0 py-0 pb-28 md:px-6 md:py-6 md:pb-0 lg:px-8">
          <AiChatBox />
        </div>
      </div>
    </main>
  );
}
