import React, { useCallback, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Linking,
} from "react-native";
import type { FileRecord } from "../../types";
import { listFiles, getDownloadUrl } from "../lib/api";

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileRecord[]>([]);
  const [searched, setSearched] = useState(false);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    try {
      const files = await listFiles(query);
      setResults(files);
      setSearched(true);
    } catch (err) {
      console.error(err);
    }
  }, [query]);

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Search files…"
          placeholderTextColor="#475569"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchBtn} onPress={search}>
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.hash}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.muted}>
              {searched ? "No results." : "Enter a keyword to search."}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => void Linking.openURL(getDownloadUrl(item.hash))}
          >
            <Text style={styles.filename} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.meta}>{item.node} · {(item.size / 1024).toFixed(1)} KB</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  searchRow: { flexDirection: "row", gap: 8, padding: 12 },
  input: {
    flex: 1,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "#f1f5f9",
  },
  searchBtn: {
    backgroundColor: "#34d399",
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBtnText: { color: "#0f172a", fontWeight: "700", fontSize: 14 },
  center: { alignItems: "center", padding: 32 },
  muted: { color: "#475569", fontSize: 14 },
  card: {
    backgroundColor: "#1e293b",
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 10,
    padding: 12,
  },
  filename: { color: "#f1f5f9", fontSize: 14, fontWeight: "600" },
  meta: { color: "#64748b", fontSize: 12, marginTop: 2 },
});
