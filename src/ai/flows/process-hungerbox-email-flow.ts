
'use server';
/**
 * @fileOverview AI flow for processing Hungerbox email text to extract sales data.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const LOG_PREFIX = "[ProcessHungerboxEmailFlow]";

const ProcessHungerboxEmailInputSchema = z.object({
  emailBody: z.string().describe('The full text content of the email from Hungerbox.'),
});
export type ProcessHungerboxEmailInput = z.infer<typeof ProcessHungerboxEmailInputSchema>;

const ProcessHungerboxEmailOutputSchema = z.object({
  isRelevantEmail: z.boolean().describe('Whether the email contains relevant Hungerbox sales data.'),
  saleDate: z.string().describe('The date of the sale in YYYY-MM-DD format.').optional(),
  totalAmount: z.number().describe('The total sales amount mentioned in the email.').optional(),
  notes: z.string().describe('Any relevant notes or summary extracted from the email.').optional(),
});
export type ProcessHungerboxEmailOutput = z.infer<typeof ProcessHungerboxEmailOutputSchema>;

// This function would be called by the API route.
export async function processHungerboxEmail(input: ProcessHungerboxEmailInput): Promise<ProcessHungerboxEmailOutput> {
  console.log(`${LOG_PREFIX} Called with input email body.`);
  try {
    const result = await processHungerboxEmailFlow(input);
    console.log(`${LOG_PREFIX} Successfully processed email.`);
    return result;
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error processing email:`, error.message, error.stack);
    throw new Error(`Failed to process email: ${error.message || error.toString()}`);
  }
}

const prompt = ai.definePrompt({
  name: 'processHungerboxEmailPrompt',
  input: {schema: ProcessHungerboxEmailInputSchema},
  output: {schema: ProcessHungerboxEmailOutputSchema},
  prompt: `You are an intelligent data extraction assistant for a food stall business.
Your task is to analyze the text content of an email and determine if it is a sales or payment confirmation from a service like Hungerbox.

If it is a relevant sales confirmation, extract the following information:
1. The total sales amount.
2. The date of the sale.
3. Summarize any other key details in the notes.

If the email is not a sales confirmation (e.g., a marketing email, a password reset, etc.), set 'isRelevantEmail' to false and leave the other fields empty.

Email Content:
---
{{{emailBody}}}
---

Extract the data based on these instructions.
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
        console.warn(`${LOG_PREFIX} AI model returned no output for email processing.`);
        throw new Error("AI model returned an invalid or empty output.");
    }
    console.log(`${LOG_PREFIX} Flow successfully processed email. Is relevant: ${outputData.isRelevantEmail}`);
    return outputData;
  }
);
