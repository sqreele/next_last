import AiChatBox from '@/app/components/ai/AiChatBox';
import AiChatMobileMenu from '@/app/components/ai/AiChatMobileMenu';

export default function AiChatPage() {
  return (
    <main className="min-h-screen bg-slate-100 md:px-6 md:py-6 lg:px-8">
      <AiChatMobileMenu />
      <div className="px-0 py-0 pb-28 md:px-0 md:py-0 md:pb-0">
        <AiChatBox />
      </div>
    </main>
  );
}
