#!/usr/bin/env python3
"""Build the Yanabee site (site/yanabee/) from content/yanabee/*.txt.

    python3 tools/yanabee/build.py            # pages, data/kb.js, worker/knowledge-yanabee.js
    python3 tools/yanabee/check_content.py    # every content line visible on the site

Each page lives in its own module (page_<name>.py exposing build()); a failing
page is reported and the others still build. See docs/YANABEE.md.
"""
import importlib
import sys
import traceback

MODULES = ['page_index', 'page_teams', 'page_operations', 'page_quran', 'page_learn', 'page_404', 'build_kb']

if __name__ == '__main__':
    only = sys.argv[1:]
    failed = []
    for name in MODULES:
        if only and name not in only and name.replace('page_', '') not in only:
            continue
        try:
            mod = importlib.import_module(name)
        except ModuleNotFoundError as e:
            if e.name == name:
                print(f'skip  {name} (not written yet)')
                continue
            failed.append(name); traceback.print_exc(); continue
        except Exception:
            failed.append(name); traceback.print_exc(); continue
        try:
            out = mod.build()
            print(f'built {name}' + (f' — {out}' if isinstance(out, str) else ''))
        except Exception:
            failed.append(name)
            print(f'FAIL  {name}')
            traceback.print_exc()
    if failed:
        print('failed:', ', '.join(failed))
        sys.exit(1)
