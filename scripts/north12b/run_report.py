#!/usr/bin/env python3
"""Build the private North12B v4 artifacts; publishing remains separately gated."""
import argparse, hashlib, json, os, subprocess, sys, time
from datetime import datetime, timezone
from pathlib import Path

CODE=Path(__file__).resolve().parent

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--source',type=Path,required=True)
    p.add_argument('--previous-source',type=Path)
    p.add_argument('--previous-kpi',type=Path)
    p.add_argument('--vk-source',type=Path,action='append',default=[],help='Optional same-batch AQ/RT or VK transaction workbook; repeat for multiple files')
    p.add_argument('--template',type=Path,required=True)
    p.add_argument('--run-dir',type=Path,required=True)
    p.add_argument('--report-date',required=True)
    p.add_argument('--font-dir',type=Path,required=True)
    args=p.parse_args()
    run=args.run_dir.resolve();root=run/'main';out=run/'output';private=run/'private-run'
    for folder in [root,out,private]:folder.mkdir(parents=True,exist_ok=True)
    source=args.source.resolve();previous=args.previous_source.resolve() if args.previous_source else None
    stem=source.stem
    expected=datetime.strptime(args.report_date,'%Y-%m-%d').strftime('%m%d')+'.xlsx'
    if source.name!=expected:raise ValueError('SOURCE_IDENTITY_MISMATCH')
    sha=hashlib.sha256(source.read_bytes()).hexdigest();run_id='north12b-'+args.report_date.replace('-','')+'-repair-01'
    env={**os.environ,'RUN_ROOT':str(root),'OUT_DIR':str(out),'REPORT_DATE':args.report_date,'SOURCE_FILE':source.name,'SOURCE_STEM':stem,'SOURCE_LOCAL':str(source),'BATCH_ID':run_id,'PROCESSING_RUN_ID':run_id,'SOURCE_SHA256':sha,'FONT_DIR':str(args.font_dir.resolve()),'TEMPLATE_PATH':str(args.template.resolve()),'PREVIOUS_SOURCE_PATH':str(previous or root/'missing-previous.xlsx'),'PREVIOUS_SOURCE_FILE':previous.name if previous else '前日無資料'}
    record={'schema':'north12b-artifact-run/v1','report_date':args.report_date,'source_file':source.name,'source_sha256':sha,'batch_id':run_id,'started_at':datetime.now(timezone.utc).isoformat(),'stages':[],'status':'processing','website_publish':'not_run','email':'not_run'}
    recordpath=private/'artifact-run.json'
    env['VK_SOURCE_PATHS']=json.dumps([str(p.resolve()) for p in args.vk_source])
    record['vk_sources']=[{'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in args.vk_source]
    def save():recordpath.write_text(json.dumps(record,ensure_ascii=False,indent=2))
    def stage(name,cmd):
        entry={'name':name,'started_at':datetime.now(timezone.utc).isoformat(),'attempt':1,'retry':0};started=time.monotonic();record['stages'].append(entry);save()
        try:
            with (private/(name+'.log')).open('w') as log:subprocess.run(cmd,env=env,check=True,stdout=log,stderr=subprocess.STDOUT)
            entry['status']='pass'
        except Exception:
            entry['status']='failed';raise
        finally:
            entry['finished_at']=datetime.now(timezone.utc).isoformat();entry['elapsed_seconds']=round(time.monotonic()-started,3);save()
    try:
        cmd=[sys.executable,str(CODE/'extract.py'),str(source),str(previous or '-')]
        if args.previous_kpi:cmd.append(str(args.previous_kpi.resolve()))
        stage('source_parse',cmd)
        daily=json.loads((root/'daily-kpi-data.json').read_text());meta=daily['meta'];kpi=json.loads((root/f'kpicalc-{stem}-corrected.json').read_text())
        insurance_dates=[meta.get('insuranceCutoff'),meta.get('previousInsuranceCutoff')]
        env.update({'CUTOFF_DATE':kpi['meta']['data_as_of_date'],'SOURCE_RANGE':meta['period'],'GENERATED_DATE':args.report_date.replace('-','/'),'CURRENT_KPI_PATH':str(root/f'kpicalc-{stem}-corrected.json'),'PREVIOUS_KPI_PATH':str(root/f'previous-kpicalc-{previous.stem if previous else "unavailable"}.json'),'CLOSURE_AUDIT_PATH':str(root/f'closure-audit-{stem}.json'),'QIS_CUTOFF':meta.get('qisCutoff') or '待確認','INSURANCE_CUTOFF':meta.get('insuranceCutoff') or '待確認','PREVIOUS_INSURANCE_CUTOFF':meta.get('previousInsuranceCutoff') or '尚未有資料','INSURANCE_DOD_SAME_MONTH':str(all(insurance_dates) and insurance_dates[0][:7]==insurance_dates[1][:7]).lower()})
        stage('workbook_build',['node',str(CODE/'build_kpi_report.mjs')])
        stage('v4_layout',['node',str(CODE/'upgrade_v4_0908.mjs')])
        stage('png_render',[sys.executable,str(CODE/'render_xlsx_cjk.py')])
        goodspeed=CODE.parent/'render_goodspeed_detail.py';book=out/f'TWM_North12B_Daily_Report_{args.report_date}.xlsx';receipt=private/'goodspeed-receipt.json'
        stage('goodspeed_render',[sys.executable,str(goodspeed),'render',str(book),str(out/f'TWM_North12B_Goodspeed_Detail_{args.report_date}.png'),'--receipt',str(receipt),'--font',str(args.font_dir.resolve()/'NotoSansTC-Regular.ttf')])
        stage('goodspeed_verify',[sys.executable,str(goodspeed),'verify',str(book),str(receipt)])
        stage('value_verify',[sys.executable,str(CODE/'verify_artifacts.py')])
        record['status']='artifacts_ready_pending_visual_review'
    except Exception as error:
        record['status']='failed_safe';record['error']=str(error);raise
    finally:
        record['finished_at']=datetime.now(timezone.utc).isoformat();save()
    print(json.dumps({'status':record['status'],'manifest':str(out/'attachment-manifest.json'),'run':str(recordpath)},ensure_ascii=False))

if __name__=='__main__':main()
