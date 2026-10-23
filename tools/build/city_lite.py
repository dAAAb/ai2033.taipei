"""Generate the same first 26,000 buildings used by the mobile renderer."""
import json
from pathlib import Path
import sys

def write_lite(source, target=None):
    source = Path(source)
    target = Path(target) if target else source.with_name(source.stem + '-lite.json')
    data = json.loads(source.read_text(encoding='utf-8'))
    buildings = data['buildings']
    count = min(26000, len(buildings['h']))
    coordinate_count = sum(buildings['n'][:count]) * 2
    data['buildings'] = {key: values[:coordinate_count if key == 'c' else count]
                         for key, values in buildings.items()}
    target.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{target}: {target.stat().st_size} bytes, {count} buildings')

if __name__ == '__main__':
    write_lite(sys.argv[1] if len(sys.argv) > 1 else '3d/data/city.json',
               sys.argv[2] if len(sys.argv) > 2 else None)
