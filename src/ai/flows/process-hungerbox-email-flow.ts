'use server';
/**
 * @fileOverview AI flow for processing Hungerbox sales summary emails.
 *
 * - processHungerboxEmail - A function that extracts structured data from email text.
 * - ProcessHungerboxEmailInput - The input type for the function.
 * - ProcessHungerboxEmailOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ProcessHungerboxEmailInputSchema = z.object({
  sourceText: z.string().describe('The plain text content of the email from Hungerbox.'),
});
export type ProcessHungerboxEmailInput = z.infer<typeof ProcessHungerboxEmailInputSchema>;

const ProcessHungerboxEmailOutputSchema = z.object({
  paymentDate: z.string().optional().describe('The date of the payment in YYYY-MM-DD format.'),
  amountReceived: z.number().optional().describe('The total amount received in INR.'),
  referenceNumber: z.string().optional().describe('The unique reference or transaction number for the payment.'),
});
export type ProcessHungerboxEmailOutput = z.infer<typeof ProcessHungerboxEmailOutputSchema>;

export async function processHungerboxEmail(input: ProcessHungerboxEmailInput): Promise<ProcessHungerboxEmailOutput> {
  return processHungerboxEmailFlow(input);
}

const prompt = ai.definePrompt({
  name: 'processHungerboxEmailPrompt',
  input: {schema: ProcessHungerboxEmailInputSchema},
  output: {schema: ProcessHungerboxEmailOutputSchema},
  prompt: `You are an expert data extraction agent. Analyze the following email text, which is a payment advice from Hungerbox.
Extract the "Payment Date", the "Amount Received" in INR, and the "Reference Number".
The amount might be labeled as "Total Amount Transferred".
The date might be labeled as "Payment Date".
The reference number might be labeled "UTR No./Ref No.".
If any of these fields are not present, do not include them in the output.

Email Content:
---
{{{sourceText}}}
---

Extract the data:
`,
});

const processHungerboxEmailFlow = ai.defineFlow(
  {
    name: 'processHungerboxEmailFlow',
    inputSchema: ProcessHungerboxEmailInputSchema,
    outputSchema: ProcessHungerboxEmailOutputSchema,
  },
  async (input) => {
    console.log("[ProcessHungerboxEmailFlow] Flow execution started.");
    const response = await prompt(input);
    const outputData = response.output;

    if (!outputData) {
      throw new Error("AI model returned no output.");
    }
    
    console.log("[ProcessHungerboxEmailFlow] Flow successfully generated output:", outputData);
    return outputData;
  }
);
