from playwright.sync_api import sync_playwright
import time

def verify_game():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8080/index.html")

        # 1. Verify Start Menu
        # Check for Team Selector
        try:
            team_name = page.locator("#team-name")
            driver_name = page.locator("#driver-name")
            print(f"Initial Team: {team_name.inner_text()} - {driver_name.inner_text()}")

            # Cycle Team
            btn_next = page.locator("button[onclick='cycleTeam(1)']")
            btn_next.click()
            time.sleep(0.5)
            print(f"Next Team: {team_name.inner_text()} - {driver_name.inner_text()}")
        except Exception as e:
            print(f"Start Menu Error: {e}")

        # 2. Start Game
        start_btn = page.locator("#start-btn")
        start_btn.click()

        # Wait for game init (HUD visible)
        try:
            page.wait_for_selector("#hud", state="visible", timeout=5000)

            # 3. Verify HUD Elements
            tyre_val = page.locator("#tyre-val")
            print(f"HUD Tyre Text: {tyre_val.inner_text()}")

            # 4. Verify Physics (Wait for countdown to end and car to move)
            # We need to simulate user interaction to ensure audio context starts maybe?
            # Browser might block audio context but physics should run.

            # Simulating key press
            page.keyboard.down("ArrowUp")
            print("Holding Gas...")
            time.sleep(6) # Wait for countdown (5s) + 1s driving

            speed_val = page.locator("#speed-val")
            print(f"Speed after start: {speed_val.inner_text()}")

        except Exception as e:
            print(f"Game Run Error: {e}")

        # Screenshot
        page.screenshot(path="verification/game_verify.png")
        browser.close()

if __name__ == "__main__":
    verify_game()
