
'use server';
/**
 * @fileOverview AI flow for generating sales trend summaries.
 *
 * - summarizeSalesTrends - A function that generates a summary of sales trends.
 * - SummarizeSalesTrendsInput - The input type for the summarizeSalesTrends function.
 * - SummarizeSalesTrendsOutput - The return type for the summarizeSalesTrends function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SoldItemSummarySchema = z.object({
  itemId: z.string(),
  name: z.string(),
  category: z.string().optional(),
  totalQuantitySold: z.number(),
  totalRevenueGenerated: z.number(),
});

const SalesSummaryStatsSchema = z.object({
  totalSalesAmount: z.number(),
  totalItemsSold: z.number(),
  totalCostOfGoodsSold: z.number(),
  totalProfit: z.number(),
  averageSaleValue: z.number(),
  profitMargin: z.number(),
  numberOfSales: z.number(),
});

const SummarizeSalesTrendsInputSchema = z.object({
  summaryStats: SalesSummaryStatsSchema.describe('Overall sales statistics for the period.'),
  topSellingItems: z.array(SoldItemSummarySchema).describe('A list of the top-selling items by quantity.'),
  dateRangeFrom: z.string().describe('Start date of the reporting period (ISO string).'),
  dateRangeTo: z.string().describe('End date of the reporting period (ISO string).'),
  siteName: z.string().optional().describe('Name of the site, if applicable.'),
  stallName: z.string().optional().describe('Name of the stall, if applicable.'),
});
export type SummarizeSalesTrendsInput = z.infer<typeof SummarizeSalesTrendsInputSchema>;

const SummarizeSalesTrendsOutputSchema = z.object({
  summary: z.string().describe('A concise, insightful textual summary of the sales trends (2-4 sentences). Focus on key takeaways, significant changes, or notable performance aspects. Mention context like site/stall if provided.'),
});
export type SummarizeSalesTrendsOutput = z.infer<typeof SummarizeSalesTrendsOutputSchema>;

export async function summarizeSalesTrends(input: SummarizeSalesTrendsInput): Promise<SummarizeSalesTrendsOutput> {
  return summarizeSalesTrendsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizeSalesTrendsPrompt',
  input: {schema: SummarizeSalesTrendsInputSchema},
  output: {schema: SummarizeSalesTrendsOutputSchema},
  prompt: `You are an expert business analyst. Your task is to generate a concise (2-4 sentences) summary of sales trends based on the provided data.
Highlight key insights, significant performance aspects, or actionable observations.
Consider the overall profit, top-selling items, and any contextual information like site or stall name.

Reporting Period: {{dateRangeFrom}} to {{dateRangeTo}}
{{#if siteName}}Site: {{siteName}}{{/if}}
{{#if stallName}}Stall: {{stallName}}{{/if}}

Overall Statistics:
- Total Sales: {{summaryStats.totalSalesAmount}}
- Total Profit: {{summaryStats.totalProfit}}
- Profit Margin: {{summaryStats.profitMargin}}%
- Number of Sales: {{summaryStats.numberOfSales}}
- Total Items Sold: {{summaryStats.totalItemsSold}}

Top Selling Items (by quantity):
{{#each topSellingItems}}
- Name: {{this.name}}, Qty Sold: {{this.totalQuantitySold}}, Revenue: {{this.totalRevenueGenerated}}
{{else}}
- No specific top-selling items data provided.
{{/each}}

Based on this data, provide your analytical summary:
`,
});

const summarizeSalesTrendsFlow = ai.defineFlow(
  {
    name: 'summarizeSalesTrendsFlow',
    inputSchema: SummarizeSalesTrendsInputSchema,
    outputSchema: SummarizeSalesTrendsOutputSchema,
  },
  async (input) => {
    const {output} = await prompt(input);
    if (!output) {
        throw new Error("Failed to generate sales trend summary from the AI model.");
    }
    return output;
  }
);
