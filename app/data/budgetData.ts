export type PaymentMethod = "checking" | "credit-capital-one" | "credit-disney" | "credit-united";

export type LineItem = {
  id: string;
  category: string;
  name: string;
  defaultAmount: number; // 0 = variable/fill in manually
  paymentMethod: PaymentMethod;
  isIncome: boolean;
  // which weeks it typically hits (1-5), empty = every week
  typicalWeeks?: number[];
};

export const CATEGORIES = [
  "Pay",
  "Standard Bills",
  "Food",
  "Pets",
  "Other",
  "Home Maintenance",
  "Digital Goods",
  "Savings",
  "Credit Cards",
  "Taxes",
  "Car Stuff",
  "Subscriptions",
  "Maih Care",
  "Donations",
] as const;

export const LINE_ITEMS: LineItem[] = [
  // PAY (Income)
  { id: "maih-pay", category: "Pay", name: "Maih Pay", defaultAmount: 3540, paymentMethod: "checking", isIncome: true },
  { id: "bren-pay", category: "Pay", name: "Bren Pay", defaultAmount: 5000, paymentMethod: "checking", isIncome: true },

  // STANDARD BILLS
  { id: "mortgage", category: "Standard Bills", name: "Mortgage", defaultAmount: 0, paymentMethod: "checking", isIncome: false },
  { id: "gas-bill", category: "Standard Bills", name: "Gas", defaultAmount: 390, paymentMethod: "checking", isIncome: false },
  { id: "electric", category: "Standard Bills", name: "Electric", defaultAmount: 393, paymentMethod: "checking", isIncome: false },
  { id: "cable", category: "Standard Bills", name: "Cable (YouTube TV)", defaultAmount: 85, paymentMethod: "checking", isIncome: false },
  { id: "internet", category: "Standard Bills", name: "Internet", defaultAmount: 90, paymentMethod: "checking", isIncome: false },
  { id: "phone", category: "Standard Bills", name: "Phone", defaultAmount: 268, paymentMethod: "checking", isIncome: false },
  { id: "sewage", category: "Standard Bills", name: "Sewage", defaultAmount: 140, paymentMethod: "checking", isIncome: false },
  { id: "water", category: "Standard Bills", name: "Water", defaultAmount: 50, paymentMethod: "checking", isIncome: false },
  { id: "ymca", category: "Standard Bills", name: "YMCA", defaultAmount: 86, paymentMethod: "checking", isIncome: false },
  { id: "nw-insurance", category: "Standard Bills", name: "NW Insurance", defaultAmount: 205, paymentMethod: "checking", isIncome: false },
  { id: "trash", category: "Standard Bills", name: "Trash", defaultAmount: 76, paymentMethod: "checking", isIncome: false },

  // FOOD
  { id: "grocery", category: "Food", name: "Grocery", defaultAmount: 265, paymentMethod: "checking", isIncome: false },
  { id: "extra-food", category: "Food", name: "Extra Food", defaultAmount: 140, paymentMethod: "checking", isIncome: false },
  { id: "family-eat-out", category: "Food", name: "Family Eating Out", defaultAmount: 85, paymentMethod: "credit-capital-one", isIncome: false },
  { id: "m-eat-out", category: "Food", name: "M Eat Out", defaultAmount: 50, paymentMethod: "credit-capital-one", isIncome: false },
  { id: "b-eat-out", category: "Food", name: "B Eat Out", defaultAmount: 50, paymentMethod: "credit-capital-one", isIncome: false },

  // PETS
  { id: "pet-insurance", category: "Pets", name: "Pet Insurance", defaultAmount: 25, paymentMethod: "checking", isIncome: false },
  { id: "cats", category: "Pets", name: "Cats", defaultAmount: 150, paymentMethod: "checking", isIncome: false },

  // OTHER
  { id: "powell-pool", category: "Other", name: "Powell Pool", defaultAmount: 0, paymentMethod: "checking", isIncome: false },
  { id: "hoa", category: "Other", name: "HOA", defaultAmount: 0, paymentMethod: "checking", isIncome: false },

  // HOME MAINTENANCE
  { id: "lawn-care", category: "Home Maintenance", name: "Lawn Care", defaultAmount: 0, paymentMethod: "checking", isIncome: false },
  { id: "mulch", category: "Home Maintenance", name: "Mulch", defaultAmount: 0, paymentMethod: "checking", isIncome: false },
  { id: "weed-care", category: "Home Maintenance", name: "Weed Care", defaultAmount: 0, paymentMethod: "checking", isIncome: false },
  { id: "bug-spray", category: "Home Maintenance", name: "Bug Spray", defaultAmount: 0, paymentMethod: "checking", isIncome: false },
  { id: "piano-tuning", category: "Home Maintenance", name: "Piano Tuning", defaultAmount: 0, paymentMethod: "checking", isIncome: false },
  { id: "cleaning", category: "Home Maintenance", name: "Cleaning", defaultAmount: 0, paymentMethod: "checking", isIncome: false },
  { id: "house-expenses", category: "Home Maintenance", name: "House Expenses", defaultAmount: 50, paymentMethod: "checking", isIncome: false },
  { id: "house-items", category: "Home Maintenance", name: "House Items", defaultAmount: 85, paymentMethod: "checking", isIncome: false },

  // DIGITAL GOODS
  { id: "gifts", category: "Digital Goods", name: "Gifts", defaultAmount: 25, paymentMethod: "credit-capital-one", isIncome: false },
  { id: "clothes", category: "Digital Goods", name: "Clothes", defaultAmount: 60, paymentMethod: "credit-capital-one", isIncome: false },
  { id: "personal-care", category: "Digital Goods", name: "Personal Care", defaultAmount: 60, paymentMethod: "checking", isIncome: false },

  // SAVINGS
  { id: "kids-savings", category: "Savings", name: "Kids Savings", defaultAmount: 0, paymentMethod: "checking", isIncome: false },
  { id: "vacation-savings", category: "Savings", name: "Vacation Savings", defaultAmount: 0, paymentMethod: "checking", isIncome: false },
  { id: "emergency-savings", category: "Savings", name: "Emergency Savings", defaultAmount: 0, paymentMethod: "checking", isIncome: false },

  // CREDIT CARDS (payments)
  { id: "cc-capital-one", category: "Credit Cards", name: "Capital One", defaultAmount: 0, paymentMethod: "checking", isIncome: false },
  { id: "cc-disney", category: "Credit Cards", name: "Disney Card", defaultAmount: 0, paymentMethod: "checking", isIncome: false },
  { id: "cc-united", category: "Credit Cards", name: "United Mileage", defaultAmount: 0, paymentMethod: "checking", isIncome: false },

  // TAXES
  { id: "tax-fees", category: "Taxes", name: "Tax Fees", defaultAmount: 0, paymentMethod: "checking", isIncome: false },
  { id: "taxes-rita", category: "Taxes", name: "Taxes / RITA", defaultAmount: 0, paymentMethod: "checking", isIncome: false },

  // CAR STUFF
  { id: "bren-car", category: "Car Stuff", name: "Bren Car", defaultAmount: 0, paymentMethod: "checking", isIncome: false },
  { id: "car-hotspot", category: "Car Stuff", name: "Car Hot Spot", defaultAmount: 26, paymentMethod: "checking", isIncome: false },
  { id: "sirius", category: "Car Stuff", name: "Sirius", defaultAmount: 27, paymentMethod: "checking", isIncome: false },
  { id: "maih-car", category: "Car Stuff", name: "Maih Car", defaultAmount: 0, paymentMethod: "checking", isIncome: false },
  { id: "plates", category: "Car Stuff", name: "Plates", defaultAmount: 0, paymentMethod: "checking", isIncome: false },
  { id: "car-maintenance", category: "Car Stuff", name: "Maintenance", defaultAmount: 0, paymentMethod: "checking", isIncome: false },
  { id: "car-gas", category: "Car Stuff", name: "Gas", defaultAmount: 25, paymentMethod: "checking", isIncome: false },
  { id: "car-insurance", category: "Car Stuff", name: "Car Insurance", defaultAmount: 189, paymentMethod: "checking", isIncome: false },

  // SUBSCRIPTIONS
  { id: "xbox", category: "Subscriptions", name: "Xbox Game Pass", defaultAmount: 33, paymentMethod: "credit-capital-one", isIncome: false },
  { id: "chatgpt", category: "Subscriptions", name: "Chat GPT", defaultAmount: 23, paymentMethod: "credit-capital-one", isIncome: false },
  { id: "microsoft", category: "Subscriptions", name: "Microsoft", defaultAmount: 15, paymentMethod: "credit-capital-one", isIncome: false },
  { id: "disney-plus", category: "Subscriptions", name: "Disney+", defaultAmount: 22, paymentMethod: "credit-capital-one", isIncome: false },
  { id: "peacock", category: "Subscriptions", name: "Peacock", defaultAmount: 3, paymentMethod: "credit-capital-one", isIncome: false },
  { id: "realm", category: "Subscriptions", name: "Realm", defaultAmount: 10, paymentMethod: "credit-capital-one", isIncome: false },
  { id: "prime", category: "Subscriptions", name: "Prime Membership", defaultAmount: 0, paymentMethod: "credit-capital-one", isIncome: false },
  { id: "photo-storage", category: "Subscriptions", name: "Photo Storage", defaultAmount: 0, paymentMethod: "credit-capital-one", isIncome: false },
  { id: "apple-cloud-m", category: "Subscriptions", name: "Apple Cloud (M)", defaultAmount: 4, paymentMethod: "credit-capital-one", isIncome: false },
  { id: "apple-cloud-b", category: "Subscriptions", name: "Apple Cloud (B)", defaultAmount: 3, paymentMethod: "credit-capital-one", isIncome: false },
  { id: "kindle", category: "Subscriptions", name: "Kindle Unlimited", defaultAmount: 13, paymentMethod: "credit-capital-one", isIncome: false },

  // MAIH CARE
  { id: "botox", category: "Maih Care", name: "Botox", defaultAmount: 0, paymentMethod: "credit-capital-one", isIncome: false },
  { id: "hair", category: "Maih Care", name: "Hair", defaultAmount: 220, paymentMethod: "credit-capital-one", isIncome: false },
  { id: "brows", category: "Maih Care", name: "Brows", defaultAmount: 65, paymentMethod: "credit-capital-one", isIncome: false },
  { id: "pedi", category: "Maih Care", name: "Pedi", defaultAmount: 100, paymentMethod: "credit-capital-one", isIncome: false },
  { id: "barre", category: "Maih Care", name: "Barre", defaultAmount: 180, paymentMethod: "credit-capital-one", isIncome: false },

  // DONATIONS
  { id: "wikimedia", category: "Donations", name: "Wikimedia", defaultAmount: 0, paymentMethod: "checking", isIncome: false },
  { id: "save-children", category: "Donations", name: "Save the Children", defaultAmount: 0, paymentMethod: "checking", isIncome: false },
];