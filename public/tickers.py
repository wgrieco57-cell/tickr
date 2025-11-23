# generate_tickers.py
import requests
import json
import time
import os

# Replace with your Finnhub API key
API_KEY = "d4g9o8pr01qm5b34j8l0d4g9o8pr01qm5b34j8lg"
BASE_URL = f"https://finnhub.io/api/v1/stock/symbol?exchange=US&token={API_KEY}"

OUTPUT_FILE = "tickers.json"

def main():
    print("Fetching tickers from Finnhub...")
    
    try:
        response = requests.get(BASE_URL)
        if response.status_code != 200:
            print("HTTP Error:", response.status_code, response.text)
            return

        tickers_data = response.json()
        print(f"Fetched {len(tickers_data)} tickers.")

        all_tickers = []
        for i, item in enumerate(tickers_data):
            symbol = item.get("symbol")
            name = item.get("description")
            if symbol and name:
                formatted = f"{symbol} ({name})"
                all_tickers.append({"symbol": symbol, "company": name, "formatted": formatted})

            # Debug: show progress every 50 tickers
            if (i + 1) % 50 == 0:
                print(f"Processed {i + 1}/{len(tickers_data)} tickers")

            # Optional: small sleep to be safe with API rate limits
            time.sleep(0.005)

        # Save JSON
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(all_tickers, f, indent=2, ensure_ascii=False)

        print(f"Saved {len(all_tickers)} tickers to {os.path.abspath(OUTPUT_FILE)}")

    except Exception as e:
        print("Error fetching tickers:", e)

if __name__ == "__main__":
    main()
