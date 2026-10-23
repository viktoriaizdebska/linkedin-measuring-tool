import type { Database } from '@/integrations/supabase/types';
export type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type StrategyData = {
 versions: Row<'strategy_versions'>[]; positioning: Row<'positioning'>[]; pillars: Row<'content_pillars'>[];
 ctas: Row<'ctas'>[]; definitions: Row<'kpi_definitions'>[]; targets: Row<'kpi_targets'>[];
 annotations: Row<'annotations'>[]; values: Row<'kpi_values'>[]; periods: Row<'periods'>[];
};
