
'use server';
/**
 * @fileOverview AI flow for processing Hungerbox email text to extract sales data.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const LOG_PREFIX = "[ProcessHungerboxEmailFlow]";

const ProcessHungerboxEmailInputSchema = z.object({
  sourceText: z.string().describe('The full text content of the email or PDF from Hungerbox.'),
});
export type ProcessHungerboxEmailInput = z.infer<typeof ProcessHungerboxEmailInputSchema>;

const ProcessHungerboxEmailOutputSchema = z.object({
  serviceContext: z.string().describe('The name of the recipient company found after "Payment Advice Raised To".'),
  amountReceived: z.number().describe('The numeric value from the "Net Payable Amount" line.'),
  paymentDate: z.string().describe('The date from the "Raised On" line in YYYY-MM-DD format.'),
  referenceNumber: z.string().describe('The number found after "SettlementId:".'),
});
export type ProcessHungerboxEmailOutput = z.infer<typeof ProcessHungerboxEmailOutputSchema>;

// This function would be called by the API route.
export async function processHungerboxEmail(input: ProcessHungerboxEmailInput): Promise<ProcessHungerboxEmailOutput> {
  console.log(`${LOG_PREFIX} Called with input text.`);
  try {
    const result = await processHungerboxEmailFlow(input);
    console.log(`${LOG_PREFIX} Successfully processed document.`);
    return result;
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error processing document:`, error.message, error.stack);
    throw new Error(`Failed to process document: ${error.message || error.toString()}`);
  }
}

const prompt = ai.definePrompt({
  name: 'processHungerboxEmailPrompt',
  input: {schema: ProcessHungerboxEmailInputSchema},
  output: {schema: ProcessHungerboxEmailOutputSchema},
  prompt: `Invoice Data Extraction Prompt
You are a highly accurate data extraction AI. Your task is to analyze text extracted from a payment advice PDF from Hungerbox and extract specific data points. The text may have formatting issues due to PDF-to-text conversion. Follow these rules precisely:

1.  **\`serviceContext\`**: Find the text immediately following "Payment Advice Raised To". This is the name of the recipient company. In the example "Payment Advice Raised To The Gut Guru DSM...", the value should be "The Gut Guru". Extract just the primary company name.

2.  **\`amountReceived\`**: Find the exact line "Net Payable Amount". Extract the numeric value from that line. Ignore any currency symbols like "Rs" or "INR". For example, from "Net Payable Amount 689", extract \`689\`. This is the most important field. If you cannot find this exact phrase, you must return \`0\`.

3.  **\`paymentDate\`**: Find the date on the line that starts with "Raised On". It will be in YYYY-MM-DD format. For example, from "Raised On :2025-06-24", extract "2025-06-24".

4.  **\`referenceNumber\`**: Find the number immediately following "SettlementId:". For example, from "SettlementId: 593694", extract "593694".

**Source Text to Analyze:**
---
{{{sourceText}}}
---

Provide the output in a valid JSON format matching the schema. Adhere strictly to the rules above.
`,
});

const processHungerboxEmailFlow = ai.defineFlow(
  {
    name: 'processHungerboxEmailFlow',
    inputSchema: ProcessHungerboxEmailInputSchema,
    outputSchema: ProcessHungerboxEmailOutputSchema,
  },
  async (input) => {
    console.log(`${LOG_PREFIX} Flow execution started.`);
    const response = await prompt(input);
    const outputData = response.output;

    if (!outputData) {
        console.warn(`${LOG_PREFIX} AI model returned no output for document processing.`);
        throw new Error("AI model returned an invalid or empty output.");
    }
    console.log(`${LOG_PREFIX} Flow successfully processed document. Amount: ${outputData.amountReceived}`);
    return outputData;
  }
);
