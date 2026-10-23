INSERT INTO public.allowed_users (email) VALUES
('viktoria@izdebska.com');
INSERT INTO public.sources (key,label) VALUES
('linkedin_api','LinkedIn API'),
('linkedin_export','LinkedIn export file'),
('manual','Manual entry'),
('baseline_2026_10_08','Baseline analysis, 8 Oct 2026');
INSERT INTO public.periods (label,start_date,end_date,kind) VALUES
('B-13','2026-04-13','2026-04-26','baseline'),
('B-12','2026-04-27','2026-05-10','baseline'),
('B-11','2026-05-11','2026-05-24','baseline'),
('B-10','2026-05-25','2026-06-07','baseline'),
('B-9','2026-06-08','2026-06-21','baseline'),
('B-8','2026-06-22','2026-07-05','baseline'),
('B-7','2026-07-06','2026-07-19','baseline'),
('B-6','2026-07-20','2026-08-02','baseline'),
('B-5','2026-08-03','2026-08-16','baseline'),
('B-4','2026-08-17','2026-08-30','baseline'),
('B-3','2026-08-31','2026-09-13','baseline'),
('B-2','2026-09-14','2026-09-27','baseline'),
('B-1','2026-09-28','2026-10-11','baseline'),
('P1','2026-10-12','2026-10-25','biweekly'),
('P2','2026-10-26','2026-11-08','biweekly'),
('P3','2026-11-09','2026-11-22','biweekly'),
('P4','2026-11-23','2026-12-06','biweekly'),
('P5','2026-12-07','2026-12-20','biweekly'),
('P6','2026-12-21','2027-01-03','biweekly'),
('P7','2027-01-04','2027-01-17','biweekly'),
('P8','2027-01-18','2027-01-31','biweekly'),
('P9','2027-02-01','2027-02-14','biweekly'),
('P10','2027-02-15','2027-02-28','biweekly'),
('P11','2027-03-01','2027-03-14','biweekly'),
('P12','2027-03-15','2027-03-28','biweekly');
INSERT INTO public.metric_catalog (key,label,metric_type,unit,aggregation_rule,kind) VALUES
('impressions','Impressions','period_total','count','Use period total; never sum overlapping snapshots','measured'),
('members_reached','Members reached','period_total','count','Use period total; never sum overlapping snapshots','measured'),
('reactions','Reactions','period_total','count','Use period total; never sum overlapping snapshots','measured'),
('comments','Comments','period_total','count','Use period total; never sum overlapping snapshots','measured'),
('reposts','Reposts','period_total','count','Use period total; never sum overlapping snapshots','measured'),
('saves','Saves','period_total','count','Use period total; never sum overlapping snapshots','measured'),
('sends','Sends','period_total','count','Use period total; never sum overlapping snapshots','measured'),
('link_clicks','Link clicks','period_total','count','Use period total; never sum overlapping snapshots','measured'),
('new_followers','New followers','daily_count','count','Sum one observation per date','measured'),
('total_followers','Total followers','level_at_date','count','Use latest observed level; never sum','measured'),
('profile_viewers_90d','Profile viewers (90 days)','level_at_date','count','Use latest observed level; never sum','measured'),
('search_appearances_7d','Search appearances (7 days)','level_at_date','count','Use latest observed level; never sum','measured'),
('viewers_target_industry_share','Target-industry viewer share','audience_share','percent','Use supplied percentage; never sum','measured'),
('viewers_senior_share','Senior viewer share','audience_share','percent','Use supplied percentage; never sum','measured');
INSERT INTO public.kpi_definitions (key,name,goal_category,description,formula,formula_version,unit,better_when,kind,sources_needed,sort_order,is_north_star) VALUES
('new_followers_14d','New followers per 14 days, shown with the target-audience share of viewers','North star','New followers per 14 days, shown with the target-audience share of viewers','Sum new_followers across period; show target-industry viewer share alongside',1,'count','higher','measured','{Export or API}',1,true),
('followers_per_1000_impressions','Followers gained per 1,000 impressions, per post, at about day 28','Conversion','Followers gained per 1,000 impressions, per post, at about day 28','followers_gained / impressions * 1000, per post at approximately day 28',1,'per 1,000 impressions','higher','measured','{API only}',2,false),
('viewers_target_industry_share','Share of content viewers in VC/PE, financial services or banking','Audience quality','Share of content viewers in VC/PE, financial services or banking','Supplied viewer share for VC/PE, financial services or banking',1,'percent','higher','measured','{Export demographics}',3,false),
('viewers_senior_share','Share of content viewers at owner, partner, CXO, VP or director level','Audience quality','Share of content viewers at owner, partner, CXO, VP or director level','Supplied viewer share for owner, partner, CXO, VP or director',1,'percent','higher','measured','{Export demographics}',4,false),
('follower_target_spot_check','Quarterly spot check: of 30 new followers, how many match the target','Audience check','Quarterly spot check: of 30 new followers, how many match the target','strict_count / sample_size * 100; also report broad_count / sample_size * 100',1,'percent','higher','self-reported','{Manual entry}',5,false),
('impressions_14d','Impressions per 14 days','Reach','Impressions per 14 days','Period impressions total',1,'count','higher','measured','{Export or API}',6,false),
('saves_reposts_per_1000','Saves + reposts per 1,000 impressions','Authority','Saves + reposts per 1,000 impressions','(saves + reposts) / impressions * 1000',1,'per 1,000 impressions','higher','measured','{API; export to confirm}',7,false),
('newsletter_from_linkedin','Newsletter subscribers who came from LinkedIn','CTA','Newsletter subscribers who came from LinkedIn','Count newsletter subscribers attributed to LinkedIn; not yet measured',1,'count','higher','not yet measured','{Newsletter data and tracked links}',8,false),
('linkedin_leads_14d','Meetings and inquiries from LinkedIn per 14 days','Leads','Meetings and inquiries from LinkedIn per 14 days','Count meetings and inquiries attributed to LinkedIn within the period',1,'count','higher','self-reported','{Lead form}',9,false);
INSERT INTO public.strategy_versions (id,version_no,valid_from,change_note) VALUES
('12102026-0000-4000-8000-000000000001',1,'2026-10-12 00:00:00 Europe/Vienna','Profile relaunch');
INSERT INTO public.positioning (version_id,position_line,thesis,concept_name,concept_description,audience,differentiation,known_for,objective) VALUES
('12102026-0000-4000-8000-000000000001','Distribution for AI rollups: which customer bases are worth buying, and how to grow them once you own them.','The Prediction Economy: once AI makes software and operations cheap, the customer base and what it lets you see is what''s left to own.','The automation band','0–30% Don''t roll up; 30–70% Roll up; 70–100% Build. At 90%: Exception: roll up for the data','Operators of AI rollups in Europe, and the US and UK investors who back them.','A distribution lens on rollups instead of a finance or operations lens, a decision rule people can use, and proof from live advisory work with about ten rollups.','The automation band, and knowing which customer bases are worth buying.','Become the reference voice on distribution for AI rollups among operators and investors, and turn that attention into subscribers and advisory clients.');
INSERT INTO public.content_pillars (version_id,key,name,description,target_share,sort_order) VALUES
('12102026-0000-4000-8000-000000000001','buying','Buying','Buying: which verticals and customer bases',NULL,1),
('12102026-0000-4000-8000-000000000001','running','Running','Running: how to grow them after the deal',NULL,2),
('12102026-0000-4000-8000-000000000001','thesis','Thesis','Thesis: The Prediction Economy',NULL,3);
INSERT INTO public.ctas (version_id,rank,label,destination,measured_how) VALUES
('12102026-0000-4000-8000-000000000001',1,'1 Follow: the profile''s main button','the profile''s main button','measured'),
('12102026-0000-4000-8000-000000000001',2,'2 Subscribe: writing.izdebska.com','writing.izdebska.com','not yet measured'),
('12102026-0000-4000-8000-000000000001',3,'3 Work with me: viktoria@izdebska.com','viktoria@izdebska.com','self-reported');
INSERT INTO public.kpi_targets (version_id,kpi_key,baseline_value,baseline_label,target_value,target_by) VALUES
('12102026-0000-4000-8000-000000000001','new_followers_14d',NULL,'about 120 (259 in September, 611 in May); target share 16%',NULL,NULL),
('12102026-0000-4000-8000-000000000001','followers_per_1000_impressions',NULL,'median 0.24; rollup-practice posts 0.80',NULL,NULL),
('12102026-0000-4000-8000-000000000001','viewers_target_industry_share',NULL,'16%',NULL,NULL),
('12102026-0000-4000-8000-000000000001','viewers_senior_share',NULL,'42%',NULL,NULL),
('12102026-0000-4000-8000-000000000001','follower_target_spot_check',NULL,'17% strict, 65% broad (n = 252)',NULL,NULL),
('12102026-0000-4000-8000-000000000001','impressions_14d',NULL,'about 21,000 (47,000 in September)',NULL,NULL),
('12102026-0000-4000-8000-000000000001','saves_reposts_per_1000',NULL,'1.13',NULL,NULL),
('12102026-0000-4000-8000-000000000001','newsletter_from_linkedin',NULL,'none yet',NULL,NULL),
('12102026-0000-4000-8000-000000000001','linkedin_leads_14d',NULL,'about 3.6 (47 in six months)',NULL,NULL);
INSERT INTO public.annotations (date,label,kind) VALUES
('2026-10-12','Profile relaunch (headline, About, Featured, banner, Experience)','strategy change');
INSERT INTO public.schedule_state (next_due) VALUES
('2026-10-27 07:00:00 Europe/Vienna');

