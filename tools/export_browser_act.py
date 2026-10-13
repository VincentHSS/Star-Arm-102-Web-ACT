"""Provider-side browser model export entry point."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from ai_service.browser_export_worker import main
if __name__=='__main__':main()
