export interface PromptItem { title: string; category: string; template: string; output: string }

/** Saved question library. Every prompt maps to something the answer engine can compute from the capture. */
export const PROMPTS: PromptItem[] = [
  { title: 'Out of stock now', category: 'Availability', template: 'What is out of stock right now?', output: 'Table' },
  { title: 'Availability by city', category: 'Availability', template: 'Show availability by city', output: 'Table' },
  { title: 'Swing availability', category: 'Availability', template: 'Is Swing available in every city?', output: 'Table' },
  { title: 'Sparkling stock-outs', category: 'Availability', template: 'Which sparkling drinks are out of stock?', output: 'Table' },
  { title: 'Deepest discounts', category: 'Pricing', template: 'Which products have the biggest discount?', output: 'Table' },
  { title: 'City price gaps', category: 'Pricing', template: 'Where do prices differ between cities?', output: 'Table' },
  { title: 'Nata De Coco pricing', category: 'Pricing', template: 'What is the discount on Nata De Coco?', output: 'Table' },
  { title: 'Estimated sell-out', category: 'Sales', template: 'Estimated sell-out in the last captures', output: 'Estimate' },
  { title: 'Fastest movers in Delhi', category: 'Sales', template: 'Estimated units sold in Delhi', output: 'Estimate' },
  { title: 'Restocks', category: 'Stock', template: 'Which products were restocked recently?', output: 'Table' },
  { title: 'Low stock', category: 'Stock', template: 'Which products are running low on stock?', output: 'Table' },
  { title: 'Shelf life', category: 'Stock', template: 'What is the shortest shelf life on the shelf?', output: 'Table' },
  { title: 'Products by category', category: 'Catalogue', template: 'How many products per category?', output: 'Table' },
  { title: 'Catalogue health', category: 'Catalogue', template: 'How is catalogue matching doing? Any duplicates?', output: 'Table' },
];
