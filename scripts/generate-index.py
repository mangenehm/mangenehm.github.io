import json
import os
from datetime import datetime
from pathlib import Path
import logging

# Logging konfigurieren
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ToolsIndexGenerator:
    def __init__(self):
        self.tools_dir = Path("tools")
        self.template_path = Path("scripts/template.html")
        self.output_path = Path("index.html")

    def validate_tool_directory(self, tool_dir):
        """Überprüft, ob ein Tool-Verzeichnis gültig ist"""
        required_files = ['tool.json', 'index.html']
        
        for file in required_files:
            if not (tool_dir / file).exists():
                logger.warning(f"Verzeichnis {tool_dir} fehlen erforderliche Dateien: {file}")
                return False
        return True

    def load_tool_metadata(self):
        """Lädt die Metadaten aller gültigen Tools"""
        tools = []
        
        # Überprüfe, ob das tools-Verzeichnis existiert
        if not self.tools_dir.exists():
            logger.error(f"Tools-Verzeichnis nicht gefunden: {self.tools_dir}")
            return tools

        # Durchsuche alle Unterverzeichnisse im tools-Verzeichnis
        for tool_dir in self.tools_dir.glob("*/"):
            if not tool_dir.is_dir():
                continue

            # Überprüfe, ob alle erforderlichen Dateien vorhanden sind
            if not self.validate_tool_directory(tool_dir):
                continue

            json_file = tool_dir / "tool.json"
            try:
                with open(json_file, "r", encoding="utf-8") as f:
                    tool_data = json.load(f)
                    tool_data['directory'] = tool_dir.name
                    
                    # Validiere erforderliche Felder
                    required_fields = ['name', 'description', 'tags']
                    if all(field in tool_data for field in required_fields):
                        tools.append(tool_data)
                    else:
                        logger.warning(f"Tool {tool_dir.name} fehlen erforderliche Felder")
                        
            except json.JSONDecodeError as e:
                logger.error(f"Fehler beim Lesen von {json_file}: {e}")
            except Exception as e:
                logger.error(f"Unerwarteter Fehler bei {tool_dir.name}: {e}")

        # Sortiere Tools nach dem letzten Update
        return sorted(tools, key=lambda x: x.get("lastUpdated", ""), reverse=True)

    def generate_tool_card(self, tool):
        """Generiert HTML für eine einzelne Tool-Karte"""
        try:
            tags_html = "".join([
                f'<span class="tag">{tag}</span>' 
                for tag in tool.get("tags", [])
            ])
            
            return f"""
                <div class="tool-card">
                    <h3>{tool['name']}</h3>
                    <p>{tool['description']}</p>
                    <div class="tags">
                        {tags_html}
                    </div>
                    <div class="tool-meta">
                        <span class="category">{tool.get('category', 'Sonstige')}</span>
                        <span class="update-date">Aktualisiert: {tool.get('lastUpdated', 'Unbekannt')}</span>
                    </div>
                    <a href="/tools/{tool['directory']}">Zum Tool →</a>
                </div>
            """
        except KeyError as e:
            logger.error(f"Fehlende erforderliche Daten in Tool: {e}")
            return ""

    def generate_index(self):
        """Generiert die komplette index.html"""
        try:
            tools = self.load_tool_metadata()
            
            if not tools:
                logger.warning("Keine gültigen Tools gefunden!")
                tools_html = "<p>Aktuell sind keine Tools verfügbar.</p>"
            else:
                tools_html = "".join([
                    self.generate_tool_card(tool) 
                    for tool in tools
                ])

            if not self.template_path.exists():
                raise FileNotFoundError(f"Template-Datei nicht gefunden: {self.template_path}")

            with open(self.template_path, "r", encoding="utf-8") as f:
                template = f.read()

            html = template.format(
                tools=tools_html,
                last_updated=datetime.now().strftime("%d.%m.%Y %H:%M"),
                tool_count=len(tools)
            )

            with open(self.output_path, "w", encoding="utf-8") as f:
                f.write(html)

            logger.info(f"Index erfolgreich generiert. {len(tools)} Tools gefunden.")
            
            # Gebe die Liste der gefundenen Tools aus
            for tool in tools:
                logger.info(f"Gefundenes Tool: {tool['name']} in {tool['directory']}")

        except Exception as e:
            logger.error(f"Fehler bei der Index-Generierung: {e}")
            raise

if __name__ == "__main__":
    try:
        generator = ToolsIndexGenerator()
        generator.generate_index()
    except Exception as e:
        logger.error(f"Schwerwiegender Fehler: {e}")
        raise