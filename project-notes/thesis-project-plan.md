# Manila Zoo Navigation and Information System

## Thesis title
Interactive Manila Zoo Navigation and Information System Integrating Fine-Tuned BERT Chatbot and QR Codes

## Proponents
- Raqintan, KC B.
- Rutas, Khem Razel T.
- Radam, Kaycee
- Mercado, Czarina Cassandra V.

## Adviser
- Prof. Erwinaldgeriko Lagda

## Date
- 05/14/2026
- 302

## System overview
This thesis proposes an interactive zoo navigation and information system that combines digital map access, QR-based location discovery, and an intelligent chatbot for visitor support. The system is intended to help users explore the zoo more easily while supporting administrative maintenance of map information and animal records.

## Key project requirements

### 1. Care Tech: Transformer
- Use a transformer-based architecture for the chatbot system.
- Research and reference: Hugging Face Transformers.

### 2. Model selection
- Model: BERT-based multilingual cased
- Alternative considered: XML-Roberta
- Aim to provide offline support via local model loading.

### 3. Navigation and map features
- Use Leaflet for 3D visual or map-like navigation support.
- Allow updating the map when there are changes.
- Include dynamic pin editing from the admin dashboard.

### 4. Chatbot functionality
- Chatbot should guide users to specific locations within the zoo.
- It should support English and Tagalog.
- It should provide specific direction and location-based assistance.
- Response accuracy should be improved so the chatbot can reliably answer user inquiries.

### 5. QR-based information system
- QR codes should provide quick access to animal-related information.
- The system should integrate QR code lookup with the zoo navigation experience.

### 6. Admin dashboard
- Admin should be able to edit pin locations.
- Admin should be able to update zoo animal records.
- Admin should be able to maintain map and chatbot information.

## Scope and limitations
- Focus on English and Tagalog chatbot support.
- Include chatbot direction assistance in scope.
- Offline availability should be considered for local model loading.
- System should be designed to improve the accuracy and reliability of chatbot guidance.

## Thesis objectives
1. Build a zoo navigation and information system that integrates map, QR code, and chatbot functions.
2. Provide a multilingual chatbot that can guide people toward specific locations in the zoo.
3. Improve the quality of visitor assistance by making responses more accurate and location-aware.
4. Support administrative maintenance of animal data and map information.
5. Make the system accessible and usable in a real-world zoo environment.

## Implementation direction
- Frontend: visitor-facing pages for map, animal directory, and QR scanning
- Backend: API layer for animal records, map pins, and chatbot logic
- AI module: transformer-based multilingual model for chatbot responses
- Admin module: dashboard for editing pins and updating animal records
- QA: validate chatbot accuracy, map functionality, and QR integration

## Summary
This project aims to create a practical digital navigation and information system for Manila Zoo by combining modern AI chatbot capabilities, QR code access, and an interactive map interface. It is designed to improve visitor experience while also giving administrators control over the zoo’s digital information.
