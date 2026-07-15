# Sign Language Translator

Real-time American Sign Language (ASL) recognition app using MediaPipe hand landmarks and scikit-learn classifiers.

## Setup

1. Clone this repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/sign-language-translator.git
   cd sign-language-translator
   ```

2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   venv\Scripts\activate        # Windows
   # source venv/bin/activate   # macOS/Linux
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Add the static ASL dataset (not included — too large for GitHub):
   - Download or copy the `ASL_Dataset` folder into the project root.
   - It must contain `train/` and `test/` subfolders.

5. Train or add the static model:
   - Run the app once to train from `ASL_Dataset`, or
   - Place a pre-trained `models/static_model.p` file in the `models/` folder.

6. Run the app:
   ```bash
   python app.py
   ```

7. Open [http://localhost:5000](http://localhost:5000) in your browser.

## Project structure

| Path | Description |
|------|-------------|
| `app.py` | Flask server and ML pipeline |
| `models/` | Hand landmarker and trained classifiers |
| `signs/` | Dynamic gesture dataset (train/valid/test) |
| `ASL_Dataset/` | Static ASL image dataset (not in repo) |
| `templates/` | HTML templates |
| `static/` | CSS and JavaScript |

## Note on large files

The `ASL_Dataset` (~4 GB) and `models/static_model.p` (~130 MB) are excluded from this repository due to GitHub size limits. Add them locally after cloning.
