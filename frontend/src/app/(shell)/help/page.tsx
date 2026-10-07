import { Card, PageHead } from '@/components/ui';

export default function Help() {
  const qa = [
    ['What does "Estimate" mean?', 'Sell-out is estimated from the change in stock between captures, with restocks excluded. It is never a sales figure.'],
    ['Out of stock vs not listed?', 'Out of stock means the product page exists but cannot be bought. Not listed means the platform shows no page for that location.'],
    ['How often is data captured?', 'Three times a day for each city. The pill in the header shows the latest capture time (IST).'],
    ['What is in the pilot?', 'Blinkit only, Delhi and Mumbai, 10–15 priority Paper Boat products.'],
  ];
  return (
    <>
      <PageHead title="Help" sub="Quick answers" />
      <div className="bento">
        {qa.map(([q, a]) => (
          <Card key={q} className="span-6" title={q}><p className="sec" style={{ margin: 0 }}>{a}</p></Card>
        ))}
      </div>
    </>
  );
}
