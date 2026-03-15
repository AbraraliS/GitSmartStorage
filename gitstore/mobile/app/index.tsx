import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
  Linking,
} from "react-native";
import type { FileRecord } from "../../types";
import { deleteFile, fetchIndex, getDownloadUrl } from "../lib/api";
import { searchFiles } from "../../lib/index";
import { emptyIndex } from "../../lib/index";

export default function FilesScreen() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadFiles = useCallback(async (force = false) => {
    try {
      const index = (await fetchIndex(force)) ?? emptyIndex();
      const all = searchFiles(index, "");
      setFiles(all);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadFiles(); }, [loadFiles]);

  const handleRefresh = () => {
    setRefreshing(true);
    void loadFiles(true);
  };

  const handleDelete = async (hash: string) => {
    try {
      await deleteFile(hash);
      await loadFiles(true);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownload = (hash: string) => {
    void Linking.openURL(getDownloadUrl(hash));
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading files…</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={files}
      keyExtractor={(item) => item.hash}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#34d399"
        />
      }
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.muted}>No files yet. Upload your first file!</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardBody}>
            <Text style={styles.filename} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.meta}>
              {item.node} · {(item.size / 1024).toFixed(1)} KB
            </Text>
            {item.tags.length > 0 && (
              <Text style={styles.tags}>{item.tags.map((t) => `#${t}`).join(" ")}</Text>
            )}
          </View>
          <View style={styles.actions}>
            <TouchableOpacity onPress={() => handleDownload(item.hash)} style={styles.btn}>
              <Text style={styles.btnText}>↓</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void handleDelete(item.hash)}
              style={[styles.btn, styles.btnDanger]}
            >
              <Text style={styles.btnText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: "#0f172a" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  muted: { color: "#475569", fontSize: 14 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 10,
    padding: 12,
  },
  cardBody: { flex: 1, marginRight: 8 },
  filename: { color: "#f1f5f9", fontSize: 14, fontWeight: "600" },
  meta: { color: "#64748b", fontSize: 12, marginTop: 2 },
  tags: { color: "#34d399", fontSize: 11, marginTop: 3 },
  actions: { flexDirection: "row", gap: 6 },
  btn: {
    width: 32,
    height: 32,
    backgroundColor: "#334155",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDanger: { backgroundColor: "#450a0a" },
  btnText: { color: "#94a3b8", fontSize: 14 },
});
