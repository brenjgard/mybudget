// Harbor Budget — Seed / Demo Data
// Load via the "Load Demo Data" button in Settings

import type { AppSettings, PaymentMethod } from "../lib/types";

export const SEED_DATA: AppSettings = {
  checkingBalance: 5000,
  creditCards: [
    { id: "credit-1" as PaymentMethod, label: "Capital One" },
    { id: "credit-2" as PaymentMethod, label: "Disney Card" },
    { id: "credit-3" as PaymentMethod, label: "United Mileage" },
  ],
  categories: [
    "Pay",
    "Standard Bills",
    "Food",
    "Subscriptions",
    "Savings",
    "Credit Cards",
  ],
  lineItems: [
    // ── PAY ──
    {
      id: "pay-a",
      category: "Pay",
      name: "Paycheck A",
      defaultAmount: 3000,
      paymentMethod: "checking",
      isIncome: true,
      frequency: "every-other-week",
      anchorDate: "2026-03-06",
    },
    {
      id: "pay-b",
      category: "Pay",
      name: "Paycheck B",
      defaultAmount: 2500,
      paymentMethod: "checking",
      isIncome: true,
      frequency: "every-other-week",
      anchorDate: "2026-03-06",
    },

    // ── STANDARD BILLS ──
    {
      id: "bill-mortgage",
      category: "Standard Bills",
      name: "Mortgage",
      defaultAmount: 1500,
      paymentMethod: "checking",
      isIncome: false,
      frequency: "once-a-month-4",
    },
    {
      id: "bill-electric",
      category: "Standard Bills",
      name: "Electric",
      defaultAmount: 200,
      paymentMethod: "checking",
      isIncome: false,
      frequency: "once-a-month-3",
    },
    {
      id: "bill-internet",
      category: "Standard Bills",
      name: "Internet",
      defaultAmount: 100,
      paymentMethod: "credit-1",
      isIncome: false,
      frequency: "once-a-month-2",
    },

    // ── FOOD ──
    {
      id: "food-grocery",
      category: "Food",
      name: "Grocery",
      defaultAmount: 300,
      paymentMethod: "credit-1",
      isIncome: false,
      frequency: "every-week",
    },
    {
      id: "food-eating-out",
      category: "Food",
      name: "Eating Out",
      defaultAmount: 100,
      paymentMethod: "credit-1",
      isIncome: false,
      frequency: "every-week",
    },

    // ── SUBSCRIPTIONS ──
    {
      id: "sub-streaming",
      category: "Subscriptions",
      name: "Streaming",
      defaultAmount: 50,
      paymentMethod: "credit-1",
      isIncome: false,
      frequency: "once-a-month-1",
    },
    {
      id: "sub-software",
      category: "Subscriptions",
      name: "Software",
      defaultAmount: 30,
      paymentMethod: "credit-1",
      isIncome: false,
      frequency: "once-a-month-1",
    },

    // ── SAVINGS ──
    {
      id: "savings-emergency",
      category: "Savings",
      name: "Emergency Fund",
      defaultAmount: 200,
      paymentMethod: "checking",
      isIncome: false,
      frequency: "twice-a-month",
    },

    // ── CREDIT CARDS ──
    {
      id: "cc-capital-one",
      category: "Credit Cards",
      name: "Capital One Payment",
      defaultAmount: 0,
      paymentMethod: "checking",
      isIncome: false,
      frequency: "once-a-month-3",
    },
    {
      id: "cc-disney",
      category: "Credit Cards",
      name: "Disney Card Payment",
      defaultAmount: 0,
      paymentMethod: "checking",
      isIncome: false,
      frequency: "once-a-month-3",
    },
    {
      id: "cc-united",
      category: "Credit Cards",
      name: "United Mileage Payment",
      defaultAmount: 0,
      paymentMethod: "checking",
      isIncome: false,
      frequency: "once-a-month-3",
    },
  ],
};
