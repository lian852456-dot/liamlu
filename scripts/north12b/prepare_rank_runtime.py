"""Build a pinned runtime install packet without modifying the live runtime."""
import argparse
import hashlib
import json
from pathlib import Path

BUILDER_BEFORE = '785ed97f6113783e53447af30697a977f1fac081e5646d1b12b986074482c58c'
PUBLISHER_BEFORE = 'c00ef081bbc3862d4ba42f987b6f31c7eed3cb2cddb995bd0e236d110ee01595'


def packet(runtime, output):
    here = Path(__file__).parent
    builder = (runtime / 'build_github_pages_data.py').read_bytes()
    publisher = (runtime / 'publish_kpi_component_data.mjs').read_bytes()
    if hashlib.sha256(builder).hexdigest() != BUILDER_BEFORE or hashlib.sha256(publisher).hexdigest() != PUBLISHER_BEFORE:
        raise RuntimeError('RUNTIME_BASE_CHANGED')
    source = builder.decode()
    source = source.replace('from build_personal_kpi_report import apply_previous_rates, extract_rows',
        'from build_personal_kpi_report import apply_previous_rates, extract_rows\nfrom personal_rank_contract import repair_component', 1)
    marker = '    return result\n\n\ndef main() -> None:'
    if source.count(marker) != 1:
        raise RuntimeError('RUNTIME_BUILDER_ANCHOR')
    source = source.replace(marker, '    return repair_component(result, source_path, previous_path=previous_source_path if previous_source_path.exists() else None)\n\n\ndef main() -> None:', 1)
    client = publisher.decode()
    client = client.replace("import { spawn } from 'node:child_process';", "import { spawn } from 'node:child_process';\nimport { createHash } from 'node:crypto';", 1)
    module = (here / 'personal_rank_publish.mjs').read_text()
    body = module[module.index('export function canonical'):].replace('export ', '')
    bundle = 'const PersonalRankPublisher = (() => {\n' + body + '\nreturn {runPreparedRankRepair};\n})();\n\n'
    client = client.replace('const projectRoot =', bundle + 'const projectRoot =', 1)
    client = client.replace('async function post(endpoint, payload) {', 'async function post(endpoint, payload, options = {}) {', 1)
    client = client.replace("    action: String(payload?.action || '').includes('access') ? 'app-readback' : 'website-readback',",
        "    action: payload?.action === 'private_publish_kpi_component' ? 'publish' : String(payload?.action || '').includes('access') ? 'app-readback' : 'website-readback',\n    ...(options.delaysMs !== undefined ? {delaysMs: options.delaysMs} : {}),", 1)
    mode = """  const rankAt = process.argv.indexOf('--personal-rank-repair');
  if (rankAt >= 0) {
    if (!process.argv[rankAt + 1]) fail('rank repair intent path is required');
    const result = await PersonalRankPublisher.runPreparedRankRepair({
      manifestPath: process.argv[rankAt + 1], reportRunDate, cutoff: dataCutoffDate,
      accessEndpoint, dashboardEndpoint, setRunId: value => { activePublicationRunId = value; },
      request: (endpoint, payload, options) => post(endpoint, adminSecret ? {...payload, adminSecret} : payload, options),
    });
    console.log(JSON.stringify({...result, mode:'personal-ranks-only'}, null, 2));
    return;
  }
"""
    anchor = "  const today = await readJson(path.join(workDir, 'today_report_data.json'));"
    if client.count(anchor) != 1:
        raise RuntimeError('RUNTIME_PUBLISHER_ANCHOR')
    client = client.replace(anchor, mode + anchor, 1)
    files = {'build_github_pages_data.py': source.encode(), 'publish_kpi_component_data.mjs': client.encode(),
             'personal_rank_contract.py': (here / 'personal_rank_contract.py').read_bytes()}
    output.mkdir(parents=True, exist_ok=False)
    manifest = {}
    for name, contents in files.items():
        (output / name).write_bytes(contents)
        original = runtime / name
        manifest[name] = {'before_sha256': hashlib.sha256(original.read_bytes()).hexdigest() if original.exists() else None,
                          'after_sha256': hashlib.sha256(contents).hexdigest()}
    (output / 'install-manifest.json').write_text(json.dumps(manifest, indent=2))
    return manifest


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--runtime', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    args = p.parse_args()
    print(json.dumps(packet(args.runtime, args.output), indent=2))
