import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Crypto from "expo-crypto";
import type { DataNode } from "../../types";
import { listNodes } from "../lib/api";

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB

export default function UploadScreen() {
  const [nodes, setNodes] = useState<DataNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<string>("");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    listNodes()
      .then((n) => {
        setNodes(n);
        if (n.length > 0) setSelectedNode(n[0].id);
      })
      .catch(console.error);
  }, []);

  const pickAndUpload = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    const nodeInfo = nodes.find((n) => n.id === selectedNode);
    if (!nodeInfo) return;

    setUploading(true);
    setStatus("Computing hash…");

    try {
      const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        asset.uri
      );
      const shortHash = hash.slice(0, 12);

      const fileSize = asset.size ?? 0;
      const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
      const date = new Date();
      const basePath = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${shortHash}_${asset.name}`;

      const chunkCount = Math.ceil(fileSize / CHUNK_SIZE);
      setStatus(`Uploading ${chunkCount} chunk(s)…`);

      // Upload chunks
      for (let i = 0; i < chunkCount; i++) {
        const offset = i * CHUNK_SIZE;
        const length = Math.min(CHUNK_SIZE, fileSize - offset);
        const chunkPath = chunkCount > 1 ? `${basePath}.chunks/${String(i).padStart(4, "0")}` : basePath;

        // Read chunk as base64
        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
          position: offset,
          length,
        });

        const res = await fetch(`${API_BASE}/api/upload/chunk`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repo: nodeInfo.repo, path: chunkPath, content: base64 }),
        });

        if (!res.ok) throw new Error(`Chunk ${i + 1} upload failed`);
        setStatus(`Uploaded chunk ${i + 1}/${chunkCount}`);
      }

      // Commit index
      setStatus("Updating index…");
      const record = {
        hash: shortHash,
        name: asset.name ?? "unnamed",
        node: nodeInfo.id,
        path: basePath,
        size: fileSize,
        type: asset.mimeType ?? "application/octet-stream",
        tags: tagList,
        created: new Date().toISOString(),
        sync_status: "syncing" as const,
        chunks: chunkCount > 1 ? Array.from({ length: chunkCount }, (_, i) =>
          `${basePath}.chunks/${String(i).padStart(4, "0")}`
        ) : undefined,
      };

      const commitRes = await fetch(`${API_BASE}/api/upload/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: [record] }),
      });

      if (!commitRes.ok) throw new Error("Index commit failed");
      setStatus("✓ Upload complete!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      Alert.alert("Upload Error", msg);
      setStatus(null);
    } finally {
      setUploading(false);
    }
  }, [nodes, selectedNode, tags]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Upload a File</Text>

      {/* Node selector */}
      <Text style={styles.label}>Target Node</Text>
      <View style={styles.nodeRow}>
        {nodes.map((n) => (
          <TouchableOpacity
            key={n.id}
            onPress={() => setSelectedNode(n.id)}
            style={[styles.nodeBadge, selectedNode === n.id && styles.nodeBadgeActive]}
          >
            <Text style={[styles.nodeBadgeText, selectedNode === n.id && styles.nodeBadgeTextActive]}>
              {n.id}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tags */}
      <Text style={styles.label}>Tags (comma-separated)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. work, 2024"
        placeholderTextColor="#475569"
        value={tags}
        onChangeText={setTags}
      />

      {/* Upload button */}
      <TouchableOpacity
        style={[styles.uploadBtn, uploading && styles.uploadBtnDisabled]}
        onPress={pickAndUpload}
        disabled={uploading || !selectedNode}
      >
        {uploading ? (
          <ActivityIndicator color="#0f172a" />
        ) : (
          <Text style={styles.uploadBtnText}>Pick & Upload File</Text>
        )}
      </TouchableOpacity>

      {status && <Text style={styles.status}>{status}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  content: { padding: 20 },
  heading: { color: "#f1f5f9", fontSize: 20, fontWeight: "700", marginBottom: 20 },
  label: { color: "#94a3b8", fontSize: 12, fontWeight: "600", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  nodeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  nodeBadge: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#1e293b", borderRadius: 20, borderWidth: 1, borderColor: "#334155" },
  nodeBadgeActive: { backgroundColor: "rgba(52,211,153,0.1)", borderColor: "rgba(52,211,153,0.3)" },
  nodeBadgeText: { color: "#64748b", fontSize: 13 },
  nodeBadgeTextActive: { color: "#34d399" },
  input: { backgroundColor: "#1e293b", borderWidth: 1, borderColor: "#334155", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: "#f1f5f9", marginBottom: 20 },
  uploadBtn: { backgroundColor: "#34d399", paddingVertical: 14, borderRadius: 12, alignItems: "center", marginBottom: 16 },
  uploadBtnDisabled: { opacity: 0.5 },
  uploadBtnText: { color: "#0f172a", fontWeight: "700", fontSize: 15 },
  status: { color: "#34d399", textAlign: "center", fontSize: 13 },
});
