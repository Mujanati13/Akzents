INSERT INTO public.status (id,name) VALUES
	 (1,'Active'),
	 (2,'Inactive');

INSERT INTO public.countries (flag,id,name,"createdAt","updatedAt") VALUES
	 (NULL,1,'{"de": "Deutschland"}','2025-06-24 11:05:59.534116','2025-06-24 11:05:59.534116'),
	 (NULL,2,'{"de": "Österreich"}','2025-06-24 11:06:27.643519','2025-06-24 11:06:27.643519'),
	 (NULL,3,'{"de": "Schweiz"}','2025-06-24 11:06:27.645615','2025-06-24 11:06:27.645615'),
	 (NULL,4,'{"de": "Luxemburg"}','2025-06-24 11:06:27.647201','2025-06-24 11:06:27.647201');

INSERT INTO public.job_types (id,name,"createdAt","updatedAt") VALUES
	 (1,'Visual Merchandiser','2025-06-24 11:44:51.955863','2025-06-24 11:44:51.955863'),
	 (2,'Sales adviser','2025-06-24 11:44:51.970555','2025-06-24 11:44:51.970555'),
	 (3,'Dekorateur','2025-06-24 11:44:51.971628','2025-06-24 11:44:51.971628'),
	 (4,'Folierung','2025-06-24 11:44:51.972465','2025-06-24 11:44:51.972465');

INSERT INTO public.languages (id,name,"createdAt","updatedAt") VALUES
	 (1,'Deutsch','2025-06-24 15:49:14.338631','2025-06-24 15:49:14.338631'),
	 (2,'Englisch','2025-06-24 15:49:14.352877','2025-06-24 15:49:14.352877'),
	 (3,'Französisch','2025-06-24 15:49:14.354402','2025-06-24 15:49:14.354402'),
	 (4,'Spanisch','2025-06-24 15:49:14.355993','2025-06-24 15:49:14.355993'),
	 (5,'Italienisch','2025-06-24 15:49:14.357118','2025-06-24 15:49:14.357118'),
	 (6,'Arabisch','2025-06-24 15:49:14.358047','2025-06-24 15:49:14.358047');

INSERT INTO public.merchandiser_status (id,name) VALUES
	 (1,'Neu'),
	 (2,'Team'),
	 (3,'Out');

INSERT INTO public.user_type (id,name) VALUES
	 (1,'akzente'),
	 (2,'client'),
	 (3,'merchandiser');

	 INSERT INTO public."report-status" (id,name,"akzenteName","clientName","merchandiserName","akzenteColor","clientColor","merchandiserColor") VALUES
	 (1,'new','New','New','New','#00709B','#00709B','#00709B'),
	 (2,'assigned','New','New','Anfrage','#00709B','#00709B','#00A8E9'),
	 (3,'accepted','Plan','Plan','Plan','#CCAF08','#CCAF08','#CCAF08'),
	 (5,'in_progress','Fällig','Fällig','Fällig','#D10003','#D10003','#D10003'),
	 (6,'due','Fällig','Fällig','Fällig','#D10003','#D10003','#D10003'),
	 (9,'valid','Ok','Ok','Ok','#6FCC08','#6FCC08','#6FCC08'),
	 (4,'draft','Alles Fix','Alles Fix','Alles Fix','#08C6CC','#08C6CC','#08C6CC'),
	 (7,'finished','Prüfen','Im Prüfen','Im Prüfen','#FF8C00','#FFD166','#6FCC08'),
	 (8,'opened_by_client','Im Prüfen','Prüfen','Im Prüfen','#6FCC08','#FF8C00','#6FCC08');

INSERT INTO public."role" (id,name) VALUES
	 (2,'User'),
	 (1,'Admin'),
	 (3,'Member'),
	 (4,'Guest');

INSERT INTO public.answer_type (id,name) VALUES
	 (1,'text'),
	 (2,'select'),
	 (4,'boolean'),
	 (3,'multiselect');

INSERT INTO public.cities (id,name,coordinates,"createdAt","updatedAt","countryId") VALUES
	 (3,'Hamburg','{53.5511,9.9937}','2025-07-18 16:51:43.022389','2025-07-18 16:51:43.022389',1),
	 (4,'Munich','{48.1351,11.582}','2025-07-18 16:51:43.030473','2025-07-18 16:51:43.030473',1),
	 (5,'Cologne','{50.9375,6.9603}','2025-07-18 16:51:43.03368','2025-07-18 16:51:43.03368',1),
	 (6,'Frankfurt','{50.1109,8.6821}','2025-07-18 16:51:43.036879','2025-07-18 16:51:43.036879',1),
	 (7,'Stuttgart','{48.7758,9.1829}','2025-07-18 16:51:43.03931','2025-07-18 16:51:43.03931',1),
	 (1,'Berlin','{52.52,13.405}','2025-07-18 15:25:18.730262','2025-07-18 15:25:18.730262',1);

INSERT INTO public.contractuals (id,name,"createdAt","updatedAt") VALUES
	 (1,'Gewerbeschein','2025-07-19 11:59:49.932415','2025-07-19 11:59:49.932415'),
	 (2,'DSVGO','2025-07-19 11:59:49.942451','2025-07-19 11:59:49.942451'),
	 (3,'Clearing','2025-07-19 11:59:49.943634','2025-07-19 11:59:49.943634');

INSERT INTO public."user" (id,email,"password",provider,"socialId","firstName","lastName",gender,phone,"createdAt","updatedAt","deletedAt","typeId","photoId","roleId","statusId") VALUES
	 (1,'lisa@akzente.de','$2b$10$0yZVdAzTFbGBT7nIFCwYEeeKmSo/RsiqmoM/YPqhhSwn4MswYlyCy','email',NULL,'Lisa','Fuss','female'::public.user_gender_enum,'+1 (918) 945-3925','2025-07-07 18:05:42.482865','2025-08-27 16:51:13.330182',NULL,1,NULL,1,1);
	 (2,'riley@woom.com','$2b$10$utfbpShSlo9rzzzFpvz7SOyqHWMJfeUz1VfwXuYsA2frxT1xtyGNu','email',NULL,'Riley','Harvey','male'::public.user_gender_enum,'+1 (487) 509-1553','2025-07-10 13:00:59.409','2025-10-06 11:43:25.246',NULL,2,NULL,2,1);
	 (3,'rooney@merchandiser.com','$2b$10$utfbpShSlo9rzzzFpvz7SOyqHWMJfeUz1VfwXuYsA2frxT1xtyGNu','email',NULL,'Rooney','Valenzuela','male'::public.user_gender_enum,'+1 (572) 716-8164','2025-06-26 11:21:21.747','2025-08-06 12:28:08.502',NULL,3,NULL,2,1);

INSERT INTO public.akzente (id,"createdAt","updatedAt",user_id) VALUES
	 (1,'2025-07-07 18:05:42.561467','2025-07-07 18:05:42.561467',1);

INSERT INTO public.client (id,"createdAt","updatedAt",user_id) VALUES
	 (1,'2025-07-07 17:44:47.375','2025-07-07 17:44:47.375',2);

INSERT INTO public.merchandiser (id,birthday,website,street,zip_code,tax_id,tax_no,nationality,"createdAt","updatedAt",user_id,city_id,"statusId") VALUES
	 (1,'2025-06-03','https://google.com','Hauptstr. 42','68897','DE123456789','123/207/50234','Marokanish','2025-06-26 11:21:21.774','2025-08-06 12:57:58.556',11,3,3);



