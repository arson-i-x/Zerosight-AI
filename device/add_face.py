import cv2
import face_recognition
import pickle
import requests
from time import sleep


def getUserFaces(user_id):
    # API route to get face encodings from DB
    try: 
        res = requests.get(f"http://localhost:8080/API/faces/get_face_encodings")
        res.raise_for_status()
        return res.json().get("faceEncodings", [])
    except Exception as e:
        print("Error fetching face encodings:", e)
        return []

def clearUserFaces(user_id):
    # API route to clear face encodings from DB
    try: 
        requests.delete(f"http://localhost:8080/API/faces/delete_all_face_encodings")
    except Exception as e:
        print("Error clearing face encodings:", e)

def addUserFace(user_id, name, encoding):
    # API route to add face encoding to DB
    try: 
        requests.post(f"http://localhost:8080/API/faces/add_face_encoding", json={
            "name": name,
            "encoding": encoding.tolist()
        })
    except Exception as e:
        print("Error adding face encoding:", e)

def capture_face(name, user_id, save_path="encodings.pkl", encs=[]):
    cap = cv2.VideoCapture(0)
    print("Press SPACE to capture your face, ESC to exit.")

    while True:
        ret, frame = cap.read()
        if not ret:
            print("Failed to capture frame.")
            break
        cv2.imshow("Capture Face", frame)
        key = cv2.waitKey(1)
        if key == 27:  # ESC
            print("Exiting without saving.")
            break
        if key == 32:  # SPACE
            if len(encs) >= 5:
                print("Maximum of 5 face encodings reached. Clear existing encodings before adding new ones.")
                continue
            elif len(encs) > 0:
                print(f"{5 - len(encs)} face encodings can still be added.")
            
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            face_locations = face_recognition.face_locations(rgb_frame)
            if len(face_locations) == 0:
                print("No face detected. Try again.")
                continue
            face_encoding = face_recognition.face_encodings(rgb_frame, face_locations)[0]
            encs.append({
                "user_id": user_id,
                "name": name,
                "encoding": face_encoding
            })
            addUserFace(user_id, name, face_encoding)
            sleep(1)  # Ensure DB write completes
            pickle.dump(encs, open(save_path, "wb"))
            print(f"Face encoding for '{name}' saved to {save_path}.")
            return face_encoding

    cap.release()
    cv2.destroyAllWindows()