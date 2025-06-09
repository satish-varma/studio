
'use server';
/**
 * @fileOverview AI flow for generating stock item descriptions.
 *
 * - generateItemDescription - A function that generates a description for a stock item.
 * - GenerateItemDescriptionInput - The input type for the generateItemDescription function.
 * - GenerateItemDescriptionOutput - The return type for the generateItemDescription function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const LOG_PREFIX = "[GenerateItemDescriptionFlow]";

const GenerateItemDescriptionInputSchema = z.object({
  itemName: z.string().describe('The name of the stock item.'),
  itemCategory: z.string().describe('The category of the stock item.'),
});
export type GenerateItemDescriptionInput = z.infer<typeof GenerateItemDescriptionInputSchema>;

const GenerateItemDescriptionOutputSchema = z.object({
  description: z.string().describe('The generated description for the item.'),
});
export type GenerateItemDescriptionOutput = z.infer<typeof GenerateItemDescriptionOutputSchema>;

export async function generateItemDescription(input: GenerateItemDescriptionInput): Promise<GenerateItemDescriptionOutput> {
  console.log(`${LOG_PREFIX} Called with input:`, input);
  try {
    const result = await generateItemDescriptionFlow(input);
    console.log(`${LOG_PREFIX} Successfully generated description for item: ${input.itemName}`);
    return result;
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error generating description for item ${input.itemName}:`, error.message, error.stack);
    throw new Error(`Failed to generate description: ${error.message || error.toString()}`);
  }
}

const prompt = ai.definePrompt({
  name: 'generateItemDescriptionPrompt',
  input: {schema: GenerateItemDescriptionInputSchema},
  output: {schema: GenerateItemDescriptionOutputSchema},
  prompt: `You are an expert copywriter specializing in product descriptions for retail.
Given the item name and category, generate a concise, appealing, and marketable product description.
The description should be 1-2 sentences long. Highlight key features or benefits if inferable.

Item Name: {{{itemName}}}
Item Category: {{{itemCategory}}}

Generate the description:
`,
});

const generateItemDescriptionFlow = ai.defineFlow(
  {
    name: 'generateItemDescriptionFlow',
    inputSchema: GenerateItemDescriptionInputSchema,
    outputSchema: GenerateItemDescriptionOutputSchema,
  },
  async (input) => {
    console.log(`${LOG_PREFIX} Flow execution started with input:`, input);
    // In Genkit 1.x, prompt errors typically throw. The response object contains the output.
    const response = await prompt(input);
    const outputData = response.output;

    if (!outputData || !outputData.description) {
        console.warn(`${LOG_PREFIX} AI model returned invalid output for item: ${input.itemName}. Output:`, outputData);
        throw new Error("AI model returned an invalid output (empty or missing description).");
    }
    console.log(`${LOG_PREFIX} Flow successfully generated output for item: ${input.itemName}`);
    return outputData;
  }
);

