'use client';

import { Collapse } from 'antd';
import { Card, PageHead } from '@/components/ui';

const FAQ: [string, string][] = [
  ['How are units sold calculated?', 'Each listing is captured three times a day (06:00, 12:00 and 20:00 IST). We order its captures by scraped_at and compare each with the one before: if stock dropped, the drop is the units sold; if stock rose, it was a restock and is not counted as sales. Revenue is units × selling price. It is a lower-bound estimate because sales that are restocked within one capture gap cannot be seen.'],
  ['How is the discount calculated?', 'Discount % = (MRP − selling price) ÷ MRP. Discount ₹ = MRP − selling price. The feed does not carry a discount, so it is always calculated. Listings that are not listed have no price and show no discount.'],
  ['Out of stock vs not listed?', 'Out of stock means the product page exists but cannot be bought. Not listed means the platform shows no page for that product at that pincode, so price, brand and category are empty by design.'],
  ['What does "Sample data" mean?', 'Search rank, competitors, ratings, media spend, forecasts and workflows are not captured yet. Those screens use placeholder numbers, marked with a "Sample data" chip, so you can see the layout. Shelf data (availability, price, discount, stock, sell-out) is real.'],
  ['Which platforms and cities are covered?', 'Blinkit in Delhi and Mumbai today. The platform and city filters already list the others as "soon"; connecting a new capture adapter turns them on without any screen changes.'],
  ['How often is data refreshed?', 'Three captures a day. The pill in the header shows the newest capture time (IST) and a breakdown per platform and city.'],
];

export default function Help() {
  return (
    <>
      <PageHead title="Help" sub="Quick answers about the numbers" />
      <Card lift={false}>
        <Collapse ghost size="large" defaultActiveKey={['0']} items={FAQ.map(([q, a], i) => ({ key: String(i), label: <b>{q}</b>, children: <p className="sec" style={{ margin: 0 }}>{a}</p> }))} />
      </Card>
    </>
  );
}
