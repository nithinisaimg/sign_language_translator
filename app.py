# app.py
import os
import pickle
import cv2
import numpy as np
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions, HandLandmarksConnections
from mediapipe.tasks.python.vision.core.image import Image, ImageFormat
from mediapipe.tasks.python.vision.core.vision_task_running_mode import VisionTaskRunningMode
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
from flask import Flask, render_template, Response, request, jsonify
import pyttsx3
import threading
import time

app = Flask(__name__, template_folder='templates', static_folder='static')

# ---------- CONFIG ----------
MODEL_DIR = 'models'
os.makedirs(MODEL_DIR, exist_ok=True)

STATIC_MODEL_PATH = os.path.join(MODEL_DIR, 'static_model.p')
DYNAMIC_MODEL_PATH = os.path.join(MODEL_DIR, 'dynamic_model.p')
STATIC_DATASET_DIR = 'ASL_Dataset'   # must contain train, test
STATIC_ORDER = ['train', 'test']
DYNAMIC_DATASET_DIR = 'signs'        # must contain train, valid, test
DYNAMIC_ORDER = ['train', 'valid', 'test']

# ---------- MEDIAPIPE ----------
HAND_LANDMARKER_MODEL = os.path.join(MODEL_DIR, 'hand_landmarker.task')
HAND_CONNECTIONS = HandLandmarksConnections.HAND_CONNECTIONS

def create_hand_landmarker(static_image_mode=True, max_num_hands=1,
                           min_detection_confidence=0.5, min_tracking_confidence=0.5):
    running_mode = VisionTaskRunningMode.IMAGE if static_image_mode else VisionTaskRunningMode.VIDEO
    options = HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=HAND_LANDMARKER_MODEL),
        running_mode=running_mode,
        num_hands=max_num_hands,
        min_hand_detection_confidence=min_detection_confidence,
        min_tracking_confidence=min_tracking_confidence,
    )
    return HandLandmarker.create_from_options(options)

def draw_hand_landmarks(frame, hand_landmarks, width, height):
    for connection in HAND_CONNECTIONS:
        start = hand_landmarks[connection.start]
        end = hand_landmarks[connection.end]
        x1, y1 = int(start.x * width), int(start.y * height)
        x2, y2 = int(end.x * width), int(end.y * height)
        cv2.line(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
    for lm in hand_landmarks:
        x, y = int(lm.x * width), int(lm.y * height)
        cv2.circle(frame, (x, y), 4, (0, 0, 255), -1)

# ---------- GLOBALS ----------
prediction_lock = threading.Lock()
latest_prediction = {'static': '', 'dynamic': ''}
static_model = None
dynamic_model = None

# ---------- UTIL ----------
def is_image_file(filename):
    n = filename.lower()
    return n.endswith(('.png', '.jpg', '.jpeg', '.bmp', '.webp'))

def extract_features_from_dataset(base_dir, ordered_subfolders, verbose=True):
    """
    Extracts hand landmarks (first detected hand per image) from dataset folders in the given order.
    Returns (data_array, labels_array)
    """
    hands = create_hand_landmarker(static_image_mode=True, max_num_hands=1,
                                   min_detection_confidence=0.8)
    data = []
    labels = []
    if verbose:
        print(f"\nStarting feature extraction for dataset: {base_dir}")
    for split in ordered_subfolders:
        split_path = os.path.join(base_dir, split)
        if not os.path.isdir(split_path):
            print(f"Warning: Expected split folder not found: {split_path}. Skipping.")
            continue
        if verbose:
            print(f" Processing split: {split}")
        for class_dir in sorted(os.listdir(split_path)):
            if class_dir.startswith('.'):
                continue
            class_path = os.path.join(split_path, class_dir)
            if not os.path.isdir(class_path):
                continue
            if verbose:
                print(f"  -> Processing class: {class_dir}")
            image_files = sorted([f for f in os.listdir(class_path) if is_image_file(f)])
            for i, fname in enumerate(image_files, 1):
                img_path = os.path.join(class_path, fname)
                img = cv2.imread(img_path)
                if img is None:
                    if verbose and (i % 200 == 0):
                        print(f"     [skip] cannot read {img_path}")
                    continue
                img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                mp_image = Image(ImageFormat.SRGB, np.ascontiguousarray(img_rgb))
                results = hands.detect(mp_image)
                if results.hand_landmarks:
                    lm = results.hand_landmarks[0]  # first detected hand (like your reference)
                    feat = []
                    for p in lm:
                        feat.extend([p.x, p.y])
                    data.append(feat)
                    labels.append(class_dir)
                else:
                    # occasional debug output for classes with many images
                    if verbose and (i % 500 == 0):
                        print(f"     processed {i}/{len(image_files)} images for class {class_dir} (some images had no hands)")
    hands.close()
    if verbose:
        print(f"Finished extraction for {base_dir}. Collected samples: {len(data)}\n")
    return np.asarray(data), np.asarray(labels)

def train_and_save(model_path, X, y):
    if X.size == 0:
        raise RuntimeError("No samples collected; cannot train.")
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, stratify=y, random_state=42)
    print(f"Training RandomForest ({len(X_train)} train, {len(X_test)} test)...")
    model = RandomForestClassifier(n_estimators=150, random_state=42)
    model.fit(X_train, y_train)
    acc = accuracy_score(model.predict(X_test), y_test)
    print(f"Training complete. Test accuracy: {acc*100:.2f}%")
    with open(model_path, 'wb') as f:
        pickle.dump({'model': model}, f)
    print(f"Saved model to: {model_path}")
    return model

def train_or_load_model(model_path, dataset_dir, ordered_subfolders, force_retrain=False):
    if os.path.exists(model_path) and not force_retrain:
        print(f"Loading existing model from: {model_path}")
        with open(model_path, 'rb') as f:
            return pickle.load(f)['model']
    # otherwise extract and train
    print(f"No saved model or retrain requested for '{dataset_dir}'. Starting extraction & training...")
    data, labels = extract_features_from_dataset(dataset_dir, ordered_subfolders, verbose=True)
    if data.size == 0:
        raise RuntimeError(f"No data extracted for dataset '{dataset_dir}'. Check your folders and images.")
    model = train_and_save(model_path, data, labels)
    return model

def initialize_models(force_retrain=False):
    global static_model, dynamic_model
    print("Initializing models (force_retrain=%s)..." % force_retrain)
    # trains / loads synchronously so UI has models ready
    static_model = train_or_load_model(STATIC_MODEL_PATH, STATIC_DATASET_DIR, STATIC_ORDER, force_retrain)
    dynamic_model = train_or_load_model(DYNAMIC_MODEL_PATH, DYNAMIC_DATASET_DIR, DYNAMIC_ORDER, force_retrain)
    print("Model initialization complete.\n")

# Block until models are ready (this avoids 'model not ready' behavior)
FORCE_FLAG = os.environ.get('FORCE_TRAIN', '0') == '1'
initialize_models(force_retrain=FORCE_FLAG)

# ---------- VIDEO / INFERENCE ----------
def generate_frames(mode):
    """
    Yields MJPEG frames with landmarks drawn and updates latest_prediction[mode].
    mode: 'static' or 'dynamic'
    """
    cap = cv2.VideoCapture(0)
    # optional: set square frame to avoid MediaPipe warnings:
    # cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    # cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 640)

    hands_detector = create_hand_landmarker(static_image_mode=False, max_num_hands=2,
                                            min_detection_confidence=0.5,
                                            min_tracking_confidence=0.5)
    model = static_model if mode == 'static' else dynamic_model
    frame_timestamp_ms = 0

    if model is None:
        print("Warning: model is None in generate_frames for mode:", mode)

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame = cv2.flip(frame, 1)
        H, W, _ = frame.shape
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = Image(ImageFormat.SRGB, np.ascontiguousarray(frame_rgb))
        results = hands_detector.detect_for_video(mp_image, frame_timestamp_ms)
        frame_timestamp_ms += 33
        predicted_text = ""

        if results.hand_landmarks and model is not None:
            preds = []
            mean_xs = []
            for hand_landmarks in results.hand_landmarks:
                feat = []
                for lm in hand_landmarks:
                    feat.extend([lm.x, lm.y])
                try:
                    p = model.predict([np.asarray(feat)])[0]
                except Exception:
                    p = "?"
                preds.append(p)
                mean_xs.append(np.mean([lm.x for lm in hand_landmarks]))
                draw_hand_landmarks(frame, hand_landmarks, W, H)
            ordered = [p for _, p in sorted(zip(mean_xs, preds))]
            predicted_text = " ".join(ordered)
            cv2.putText(frame, predicted_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0,0,0), 3, cv2.LINE_AA)
            # update shared latest_prediction
            with prediction_lock:
                latest_prediction[mode] = predicted_text
        else:
            # no hands detected, clear latest prediction (optional)
            with prediction_lock:
                latest_prediction[mode] = ""

        # encode frame
        ret2, buffer = cv2.imencode('.jpg', frame)
        if not ret2:
            continue
        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

    cap.release()
    hands_detector.close()

# ---------- FLASK ROUTES ----------
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/video_feed/<mode>')
def video_feed(mode):
    if mode not in ('static', 'dynamic'):
        return "Mode must be 'static' or 'dynamic'", 400
    return Response(generate_frames(mode), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/current_prediction/<mode>')
def current_prediction(mode):
    if mode not in ('static', 'dynamic'):
        return jsonify({'error': 'invalid mode'}), 400
    with prediction_lock:
        pred = latest_prediction.get(mode, '')
    return jsonify({'prediction': pred})

@app.route('/speak', methods=['POST'])
def speak():
    data = request.get_json(force=True)
    text = data.get('text', '')
    if not text:
        return jsonify({'status': 'no text'}), 400
    # server-side TTS fallback
    try:
        engine = pyttsx3.init()
        engine.say(text)
        engine.runAndWait()
        return jsonify({'status': 'spoken'})
    except Exception as e:
        return jsonify({'status': 'tts error', 'error': str(e)}), 500

@app.route('/retrain', methods=['POST'])
def retrain():
    # retrain synchronously (blocks) — return when done
    force = True
    try:
        initialize_models(force_retrain=force)
        return jsonify({'status': 'retrained'})
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)}), 500

if __name__ == '__main__':
    # run Flask app
    app.run(host='0.0.0.0', port=5000, debug=True)
