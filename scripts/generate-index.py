import json
import os
from datetime import datetime
from pathlib import Path

class ToolsIndexGenerator:
    def __init__(self):
        self.tools_dir = Path("tools")
        self.template_path = Path("scripts/template.html")
        self.output_path = Path("index.html")

    def load_tool_metadata(self):
        """Lädt die Metadaten aller Tools"""
        tools = []
        for tool_dir in self.tools_dir.glob("*/"):
            json_file = tool_dir / "tool.json"
            if json_file.exists():
                with open(json_file, "r", encoding="utf-8") as f:
                    try:
                        tool_data = json.load(f)
                        tool_data['directory'] = tool_dir.name
                        tools.append(tool_data)
                    except json.JSONDecodeError as e:
                        print(f"Fehler beim Lesen von {json_file}: {e}")
        
        return sorted(tools, key=lambda x: x.get("lastUpdated", ""), reverse=True)

    def generate_tool_card(self, tool):
        """Generiert HTML für eine einzelne Tool-Karte"""
        tags_html = "".join([f'<span class="tag">{tag}</span>' for tag in tool.get("tags", [])])
        
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

    def generate_index(self):
        """Generiert die komplette index.html"""
        tools = self.load_tool_metadata()
        tools_html = "".join([self.generate_tool_card(tool) for tool in tools])
        
        with open(self.template_path, "r", encoding="utf-8") as f:
            template = f.read()
        
        html = template.format(
            tools=tools_html,
            last_updated=datetime.now().strftime("%d.%m.%Y %H:%M"),
            tool_count=len(tools)
        )
        
        with open(self.output_path, "w", encoding="utf-8") as f:
            f.write(html)
        
        print(f"Index erfolgreich generiert. {len(tools)} Tools gefunden.")

if __name__ == "__main__":
    generator = ToolsIndexGenerator()
    generator.generate_index()
