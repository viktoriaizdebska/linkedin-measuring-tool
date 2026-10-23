import { describe,expect,it } from 'vitest';
import { positionSchema,saveSchema,eventSchema,draftSchema,hasChanges,destinationHref } from '@/lib/strategy-schema';
import { latestKpi } from '@/components/strategy-panel';
import type { StrategyData } from './strategy';

describe('Version edit rules (no database writes)',()=>{
 it('requires a nonempty short change note',()=>{
  expect(saveSchema.shape.change_note.safeParse('').success).toBe(false);
  expect(saveSchema.shape.change_note.safeParse(' ').success).toBe(false);
  expect(saveSchema.shape.change_note.safeParse('a'.repeat(201)).success).toBe(false);
  expect(saveSchema.shape.change_note.safeParse('Updated audience').success).toBe(true);
 });
 it('accepts nullable targets and zero without treating zero as missing',()=>{
  const target=draftSchema.shape.targets.element;
  expect(target.parse({kpi_key:'reach',target_value:0,target_by:null}).target_value).toBe(0);
  expect(target.parse({kpi_key:'reach',target_value:null,target_by:'2026-11-08'}).target_by).toBe('2026-11-08');
  expect(target.safeParse({kpi_key:'reach',target_value:1,target_by:'2026-02-30'}).success).toBe(false);
 });
 it('never accepts editable baseline fields or KPI definitions',()=>{
  const target=draftSchema.shape.targets.element.parse({kpi_key:'reach',target_value:10,target_by:null,baseline_value:999});
  expect(target).not.toHaveProperty('baseline_value');
  expect(positionSchema.shape).not.toHaveProperty('kpi_name');
 });
 it('detects changes and reverted edits',()=>{
  const draft={base_id:'12102026-0000-4000-8000-000000000001',positioning:{position_line:'Original',thesis:'Thesis',concept_name:'Concept',concept_description:'Description',audience:'Audience',differentiation:'Difference',known_for:'Known',objective:'Objective'},pillars:[],ctas:[],targets:[]};
  expect(hasChanges(draft,structuredClone(draft))).toBe(false);
  const edit=structuredClone(draft);edit.positioning.position_line='Changed';
  expect(hasChanges(draft,edit)).toBe(true);edit.positioning.position_line='Original';expect(hasChanges(draft,edit)).toBe(false);
 });
 it('restricts event kinds and requires date and label',()=>{
  expect(eventSchema.safeParse({date:'2026-10-12',label:'Campaign',kind:'campaign'}).success).toBe(true);
  expect(eventSchema.safeParse({date:'',label:'',kind:'unknown'}).success).toBe(false);
 });
 it('does not turn unsafe destinations into links',()=>{
  expect(destinationHref('javascript:alert(1)')).toBeUndefined();
  expect(destinationHref("the profile's main button")).toBeUndefined();
  expect(destinationHref('writing.izdebska.com')).toBe('https://writing.izdebska.com');
 });
 it('has no latest value when the database has no KPI rows',()=>{
  expect(latestKpi({values:[],periods:[]} as unknown as StrategyData,'reach')).toBeUndefined();
 });
});
