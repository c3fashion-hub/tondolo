// The privacy policy and terms, in plain British English. DRAFTS written by Claude from the product
// specification for Mags (and ideally a solicitor) to check and approve; legal wording is her call.
// Square brackets mark facts only Mags can fill in. Set APPROVED to true once she has.

export const LEGAL_APPROVED = false;
export const LEGAL_UPDATED = "18 October 2026";

export type LegalSection = { heading: string; paragraphs: string[] };

export const PRIVACY: LegalSection[] = [
  { heading: "Who we are", paragraphs: [
    "Tondolo is run and sold by La Jet Fete Ltd, a company registered in England and Wales (company number 08128269), 43 Berkeley Square, London W1J 5FJ. We decide how your information is used, so we are its controller under UK data protection law (UK GDPR). Questions or requests: help@tondolo.app. Registered with the Information Commissioner's Office (ICO), registration number ZC177533.",
  ] },
  { heading: "What we keep", paragraphs: [
    "Your email address, so you can sign in. The first names you choose to give. Your wedding's date, place and home currency, and any budget you set. The payments, suppliers, reminders and notes you add, and the documents you upload.",
    "We never ask for your address, card numbers or bank details. Quotes, contracts and receipts you upload often include names, addresses and bank details, so we store them privately for your wedding only.",
    "For voice notes, only the words are kept, never a recording. Your phone's keyboard turns speech into words, and your phone's own voice reads the briefing aloud; your phone's maker handles both, under its own privacy terms.",
  ] },
  { heading: "Why we use it", paragraphs: [
    "To give you the service you signed up for: your totals, reminders, health check and the Protection Kit. To keep your account secure. To send the emails you choose, such as payment reminders; you can turn them off in Settings.",
    "We don't sell your information, show you adverts or use it to train any AI.",
  ] },
  { heading: "Who sees it", paragraphs: [
    "Only the people you invite to your wedding, with the rights of their role: partners see everything; a planner sees everything except your notes; family members see overall progress and the payments they cover.",
  ] },
  { heading: "Companies that help us", paragraphs: [
    "Supabase stores your information, your files and your sign-in, in London.",
    "Netlify runs the website and some of its server work, in the United States.",
    "Anthropic reads the documents, notes and questions you choose to send, to suggest payments and answer questions, in the United States. It doesn't use them to train its models.",
    "Resend sends our emails. Stripe takes payment for Tondolo as the seller of record, under its own privacy policy; we never see your card details.",
    "When your information is handled outside the UK, we rely on [the safeguards that apply, for example the UK International Data Transfer Addendum or the UK–US data bridge].",
  ] },
  { heading: "How long we keep it", paragraphs: [
    "Until you delete it. We plan to delete each wedding automatically 12 months after its date, and we'll remind you to download a copy first.",
    "The owner can delete the whole wedding, and the accounts of everyone on it, in Settings (Delete everything). Anyone else can delete their own account there. Uploaded files are removed within the hour.",
  ] },
  { heading: "Your rights", paragraphs: [
    "You can see and download everything we hold about your wedding (Settings, Download a spreadsheet), correct it in the app, delete it, or ask us to stop using it. Contact help@tondolo.app for anything else.",
    "If you're unhappy with how we've handled your information, you can complain to the Information Commissioner's Office (ico.org.uk).",
  ] },
  { heading: "Cookies", paragraphs: [
    "We only use the cookies needed to keep you signed in. No advertising or tracking cookies.",
  ] },
];

export const TERMS: LegalSection[] = [
  { heading: "What Tondolo is", paragraphs: [
    "Tondolo helps you organise your wedding money: what you've committed, what's due and when, in every currency. It doesn't hold, send or protect money.",
  ] },
  { heading: "Please check your information", paragraphs: [
    "Tondolo reads documents, converts currencies and suggests actions automatically, and technology can get things wrong. Always check amounts, dates and details against your contracts, invoices and bank statements before you pay. Exchange rates are a guide and can differ from what your bank or card charges.",
    "The Protection Kit and the tips in the app are general information, not legal or financial advice. Check with your card provider, bank or a professional.",
  ] },
  { heading: "Paying for Tondolo", paragraphs: [
    "One payment of £49, US$59 or €55, tax included. No subscription. Tondolo is a La Jet Fete Ltd product; Stripe sells it to you as the seller of record and handles the tax.",
    "It covers one wedding, for up to 5 people, until 12 months after the wedding date.",
  ] },
  { heading: "Cancelling and refunds", paragraphs: [
    "[Mags's approved wording. Proposed: Tondolo unlocks straight away. Before paying, you agree to start using it at once and accept that you then lose your 14-day right to cancel, so there are no refunds.]",
  ] },
  { heading: "Your information and your account", paragraphs: [
    "What you add stays yours. You can download it or delete it at any time. Our privacy policy explains how we look after it.",
    "Please only invite people you trust, and only upload documents you're allowed to share.",
  ] },
  { heading: "If something goes wrong", paragraphs: [
    "[Limits of responsibility, to be written with a solicitor.]",
  ] },
  { heading: "The law that applies", paragraphs: [
    "[England and Wales, to be confirmed.] Questions: help@tondolo.app.",
  ] },
];
