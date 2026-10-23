import { queryOptions } from '@tanstack/react-query';
import { loadStrategy } from './strategy.functions';
export const strategyQuery = () => queryOptions({queryKey:['strategy'],queryFn:()=>loadStrategy(),staleTime:0,retry:false});
import { loadMeasurement } from './measurement.functions';
export const measurementQuery = () => queryOptions({queryKey:['measurement'],queryFn:()=>loadMeasurement(),staleTime:0,retry:false});
import { loadDiagnosis } from './diagnosis.functions';
export const diagnosisQuery = () => queryOptions({queryKey:['diagnosis'],queryFn:()=>loadDiagnosis(),staleTime:0,retry:false});
import { loadSchedule } from './schedule.functions';
export const scheduleQuery = () => queryOptions({queryKey:['schedule'],queryFn:()=>loadSchedule(),staleTime:0,retry:false});
